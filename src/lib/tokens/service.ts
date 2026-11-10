import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { generateStructured, INJECTION_RULE, providerStatus, untrusted } from "@/lib/ai/provider";
import { ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { platformLabel } from "@/lib/refine/platforms";
import { checkPreserved, compressLocal, type PreserveCheck } from "./compress";
import { estimateTokens } from "./estimate";

export type TokenMethod = "compress-local" | "compress-ai" | "refine";

/** Counts only: no prompt text is ever written here. */
export async function recordTokenEvent(e: { userId: string; method: TokenMethod; platform: string; source: "extension" | "web"; before: number; after: number }) {
  const db = await getDb();
  await db.insert(schema.tokenEvents).values({ userId: e.userId, method: e.method, platform: e.platform, source: e.source, tokensBefore: e.before, tokensAfter: e.after });
}

/* ------------------------------ AI compression ----------------------------- */

const CompressSchema = z.object({
  compressed: z.string().describe("The shortest prompt that still asks for exactly the same thing."),
  cut: z.array(z.string()).describe("What you removed, as 2-6 word labels. 0-5."),
});

const SYSTEM = `You shorten prompts to save tokens without changing what they ask for.

Keep, exactly: every instruction, requirement and constraint; every number, name, date, URL, quoted text, code and {{placeholder}}; every negation ("don't", "never", "without", "avoid"); the requested output format, length and tone; the language of the original.
Remove: greetings, politeness, sign-offs, filler, hedging, repetition, meta-talk ("I want you to", "your task is to"), and explanations the model doesn't need.
Prefer terse imperative phrasing; short lists are fine. Never add requirements. Never answer the prompt. If it's already minimal, return it unchanged.
${INJECTION_RULE}`;

/** `by`: whose version this is. The model's only wins when it is shorter than the free local pass. */
export type AiCompression = { text: string; before: number; after: number; saved: number; ratio: number; check: PreserveCheck; cut: string[]; model: string; by: "ai" | "local" | "none" };

export async function compressWithAI(input: { prompt: string; platform: string; userId: string }): Promise<AiCompression> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new ApiError(400, "Add a prompt first.");
  if (prompt.length > 12_000) throw new ApiError(413, "Prompts up to 12,000 characters.");
  if (!providerStatus().configured) throw new ApiError(503, "Compress more needs a model on the UPSHIFT server. Local compression still works.", "provider_not_configured");

  const before = estimateTokens(prompt);
  const { data, model } = await generateStructured({
    operation: "tokens.compress",
    userId: input.userId,
    system: SYSTEM,
    effort: "low",
    speed: "fast",
    maxTokens: Math.min(8000, before * 2 + 400),
    schema: CompressSchema,
    content: [{ type: "text", text: `Target platform: ${platformLabel(input.platform)}\n\n${untrusted("user prompt", prompt)}` }],
  });

  const text = data.compressed.trim();
  const after = estimateTokens(text);
  // Longer, empty or no better than the free local pass: say so instead of pretending.
  const local = compressLocal(prompt);
  if (local.check.ok && local.saved > 0 && (!text || local.after <= after)) return { text: local.text, before, after: local.after, saved: local.saved, ratio: local.ratio, check: local.check, cut: [], model, by: "local" };
  if (!text || after >= before) return { text: prompt, before, after: before, saved: 0, ratio: 0, check: { ok: true, issues: [] }, cut: [], model, by: "none" };
  return { text, before, after, saved: before - after, ratio: (before - after) / before, check: checkPreserved(prompt, text), cut: data.cut.slice(0, 5), model, by: "ai" };
}

/* --------------------------------- workload -------------------------------- */

export type TokenStats = {
  month: { saved: number; compressed: number; refineAdded: number; refined: number; before: number };
  days: { day: string; saved: number; count: number }[];
  platforms: { platform: string; saved: number; count: number }[];
  upshift: { input: number; output: number; calls: number };
};

export async function tokenStats(userId: string, now = new Date()): Promise<TokenStats> {
  const db = await getDb();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const since30 = new Date(now.getTime() - 29 * 86_400_000);
  since30.setUTCHours(0, 0, 0, 0);
  const t = schema.tokenEvents;
  const isCompress = sql`${t.method} like 'compress-%'`;
  const savedExpr = sql<number>`coalesce(sum(greatest(${t.tokensBefore} - ${t.tokensAfter}, 0)) filter (where ${isCompress}), 0)::int`;

  const [m] = await db
    .select({
      saved: savedExpr,
      compressed: sql<number>`count(*) filter (where ${isCompress})::int`,
      before: sql<number>`coalesce(sum(${t.tokensBefore}) filter (where ${isCompress}), 0)::int`,
      refineAdded: sql<number>`coalesce(sum(${t.tokensAfter} - ${t.tokensBefore}) filter (where ${t.method} = 'refine'), 0)::int`,
      refined: sql<number>`count(*) filter (where ${t.method} = 'refine')::int`,
    })
    .from(t)
    .where(and(eq(t.userId, userId), gte(t.createdAt, monthStart)));

  const dayCol = sql<string>`to_char(date_trunc('day', ${t.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
  const dayRows = await db
    .select({ day: dayCol, saved: savedExpr, count: sql<number>`count(*)::int` })
    .from(t)
    .where(and(eq(t.userId, userId), gte(t.createdAt, since30)))
    .groupBy(dayCol);
  const byDay = new Map(dayRows.map((r) => [r.day, r]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(since30.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(d);
    return { day: d, saved: Number(r?.saved ?? 0), count: Number(r?.count ?? 0) };
  });

  const platforms = await db
    .select({ platform: t.platform, saved: savedExpr, count: sql<number>`count(*)::int` })
    .from(t)
    .where(and(eq(t.userId, userId), gte(t.createdAt, monthStart)))
    .groupBy(t.platform);

  const u = schema.aiUsage;
  const [usage] = await db
    .select({ input: sql<number>`coalesce(sum(${u.inputTokens}), 0)::int`, output: sql<number>`coalesce(sum(${u.outputTokens}), 0)::int`, calls: sql<number>`count(*)::int` })
    .from(u)
    .where(and(eq(u.userId, userId), gte(u.createdAt, monthStart)));

  return {
    month: { saved: Number(m?.saved ?? 0), compressed: Number(m?.compressed ?? 0), before: Number(m?.before ?? 0), refineAdded: Number(m?.refineAdded ?? 0), refined: Number(m?.refined ?? 0) },
    days,
    platforms: platforms.map((p) => ({ platform: p.platform, saved: Number(p.saved), count: Number(p.count) })).sort((a, b) => b.saved - a.saved),
    upshift: { input: Number(usage?.input ?? 0), output: Number(usage?.output ?? 0), calls: Number(usage?.calls ?? 0) },
  };
}
