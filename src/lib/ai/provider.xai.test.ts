import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
const calls: Captured[] = [];
let reply: () => { status: number; json: unknown } = () => ({ status: 200, json: {} });

const stub: typeof fetch = async (input, init) => {
  calls.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(String(init?.body ?? "{}")) });
  const r = reply();
  return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
};

const completion = (content: string, extra: Record<string, unknown> = {}) => ({
  status: 200,
  json: {
    id: "x",
    model: "grok-4-fast",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content, ...extra } }],
    usage: { prompt_tokens: 900, completion_tokens: 200 },
  },
});

async function user() {
  const { getDb, schema } = await import("@/lib/db");
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ email: `x-${Date.now()}-${Math.random()}@x.test`, name: "x", passwordHash: "x" }).returning();
  return { u, db, schema };
}

describe("xAI provider (stubbed HTTP)", () => {
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.XAI_API_KEY = "xai-test";
    (await import("./provider")).__setProviderFetchForTests(stub);
  });
  afterAll(async () => {
    delete process.env.XAI_API_KEY;
    (await import("./provider")).__setProviderFetchForTests(undefined);
  });

  it("is selected automatically when only XAI_API_KEY is set", async () => {
    const { providerStatus } = await import("./provider");
    expect(providerStatus()).toMatchObject({ configured: true, provider: "xai", model: "grok-4-fast", fallbacks: false });
  });

  it("sends a strict json_schema request with text and images, and validates the reply", async () => {
    const { generateStructured } = await import("./provider");
    const { u, db, schema } = await user();
    reply = () => completion(JSON.stringify({ verdict: "met", notes: ["ok"] }));
    const out = await generateStructured({
      operation: "audit.evaluate",
      userId: u.id,
      system: "sys",
      content: [
        { type: "text", text: "look" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } },
      ],
      schema: z.object({ verdict: z.enum(["met", "not_met"]), notes: z.array(z.string()) }),
    });
    expect(out.data).toEqual({ verdict: "met", notes: ["ok"] });
    const req = calls.at(-1)!;
    expect(req.url).toBe("https://api.x.ai/v1/chat/completions");
    expect(req.headers.authorization).toBe("Bearer xai-test");
    const rf = req.body.response_format as { type: string; json_schema: { strict: boolean; schema: { additionalProperties: boolean; $schema?: string } } };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema.additionalProperties).toBe(false);
    expect(rf.json_schema.schema.$schema).toBeUndefined();
    const msgs = req.body.messages as { role: string; content: unknown }[];
    expect(msgs[0]).toEqual({ role: "system", content: "sys" });
    expect(msgs[1].content).toEqual([
      { type: "text", text: "look" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA", detail: "high" } },
    ]);
    const [row] = await db.select().from(schema.aiUsage).where((await import("drizzle-orm")).eq(schema.aiUsage.userId, u.id));
    // No price configured for Grok: tokens recorded, cost left at 0 rather than guessed.
    expect(row).toMatchObject({ model: "grok-4-fast", inputTokens: 900, outputTokens: 200, ok: true, estimatedCostUsd: "0.000000" });
  });

  it("maps refusals, truncation, bad keys and unknown models to clear errors", async () => {
    const { generateStructured, ProviderError } = await import("./provider");
    const { u } = await user();
    const req = { operation: "t", userId: u.id, system: "s", content: [{ type: "text" as const, text: "x" }], schema: z.object({ n: z.number() }) };
    reply = () => completion("", { refusal: "no" });
    await expect(generateStructured(req)).rejects.toThrow(/declined/);
    reply = () => ({ ...completion('{"n":'), json: { ...completion("").json, choices: [{ finish_reason: "length", message: { content: '{"n":' } }] } });
    await expect(generateStructured(req)).rejects.toThrow(/out of output space/);
    reply = () => ({ status: 401, json: { error: "bad key" } });
    await expect(generateStructured(req)).rejects.toThrow(/rejected the configured API key/);
    reply = () => ({ status: 404, json: { error: "model not found" } });
    await expect(generateStructured(req)).rejects.toThrow(/XAI_MODEL/);
    reply = () => completion(JSON.stringify({ n: "nope" }));
    await expect(generateStructured(req)).rejects.toBeInstanceOf(ProviderError);
  });

  it("an audit keeps its automated findings when the model call fails", async () => {
    const { u, db, schema } = await user();
    const { eq } = await import("drizzle-orm");
    const [p] = await db.insert(schema.projects).values({ userId: u.id, name: "p", contentType: "text" }).returning();
    await db.insert(schema.requirements).values({ projectId: p.id, text: "Mentions pricing", category: "content", status: "confirmed" });
    const [a] = await db.insert(schema.artifacts).values({ projectId: p.id, version: 1, kind: "text", textContent: "Lorem ipsum draft" }).returning();
    const { startEvaluation, runEvaluation } = await import("@/lib/services/audit");
    reply = () => ({ status: 503, json: { error: "overloaded" } });
    const { evaluation } = await startEvaluation(u.id, p.id, a.id);
    await runEvaluation(u.id, evaluation.id);
    const [ev] = await db.select().from(schema.evaluations).where(eq(schema.evaluations.id, evaluation.id));
    expect(ev.status).toBe("complete");
    expect(ev.summary.methods?.find((m) => m.id === "model")).toMatchObject({ ran: false });
    const fs = await db.select().from(schema.findings).where(eq(schema.findings.evaluationId, evaluation.id));
    expect(fs.find((f) => f.checkKey === "check:placeholder_content")?.status).toBe("verified_fail");
    expect(fs.find((f) => f.checkKey.startsWith("req:"))?.status).toBe("not_tested");
  });
});
