import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { LINT_LABELS } from "@/lib/engines/prompt-lint";
import { isFailing } from "@/lib/engines/taxonomy";

/** Practical advice keyed by the deterministic prompt-gap ids. Static, so it never claims to be personalised learning. */
export const ADVICE: Record<string, string> = {
  vague_qualities: "Swap adjectives for observable descriptions: “dark background, one accent colour, generous whitespace” instead of “premium”. Or link a reference.",
  no_audience: "Start prompts with who it is for and what they should do next. It changes structure and copy more than any style word.",
  no_output_format: "Name the stack and deliverable up front (e.g. “single Next.js page, Tailwind, one file”).",
  no_success_criteria: "End prompts with a short “Done when” list. Tools follow it, and audits can check it.",
  no_responsive: "Ask for mobile behaviour explicitly: the breakpoint, what stacks, what hides.",
  no_accessibility: "Add one line: “WCAG AA contrast, keyboard reachable, alt text on images.”",
  no_exclusions: "List 2–3 things you never want. It is the fastest way to stop generic output.",
  no_constraints: "Give at least one hard limit: length, number of sections, libraries allowed.",
  no_visual_reference: "Give colours, a typeface, or a reference site so the tool doesn't fall back to its defaults.",
  too_short: "A good prompt is usually 60–200 words. Use the brief to fill it, not filler.",
  stacked_asks: "Split long wish-lists into steps, or mark which items are must-haves.",
  conflicting_density: "When you want both “minimal” and “lots of features”, say which wins.",
};

export async function computeInsights(userId: string) {
  const db = await getDb();
  const projects = await db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.userId, userId));
  const ids = projects.map((p) => p.id);
  if (!ids.length) return null;
  const [prompts, artifacts, evaluations] = await Promise.all([
    db.select().from(schema.prompts).where(inArray(schema.prompts.projectId, ids)),
    db.select().from(schema.artifacts).where(inArray(schema.artifacts.projectId, ids)),
    db.select().from(schema.evaluations).where(inArray(schema.evaluations.projectId, ids)).orderBy(desc(schema.evaluations.createdAt)),
  ]);
  const complete = evaluations.filter((e) => e.status === "complete");
  const findings = complete.length ? await db.select().from(schema.findings).where(inArray(schema.findings.evaluationId, complete.map((e) => e.id))) : [];

  // Prompt gaps across the user's own original prompts.
  const originals = prompts.filter((p) => p.kind === "original");
  const gapCounts = new Map<string, number>();
  for (const p of originals) for (const w of p.analysis.weaknesses ?? []) if (w.source === "deterministic") gapCounts.set(w.id, (gapCounts.get(w.id) ?? 0) + 1);
  const gaps = [...gapCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, label: LINT_LABELS[id] ?? id, count: n, share: n / originals.length, advice: ADVICE[id] }));

  // Latest audit per output version.
  const latestByArtifact = new Map<string, (typeof complete)[number]>();
  for (const e of complete) if (!latestByArtifact.has(e.artifactId)) latestByArtifact.set(e.artifactId, e);
  const latestIds = new Set([...latestByArtifact.values()].map((e) => e.id));
  const latestFindings = findings.filter((f) => latestIds.has(f.evaluationId));
  const failCats = new Map<string, number>();
  for (const f of latestFindings) if (isFailing(f.status)) failCats.set(f.category, (failCats.get(f.category) ?? 0) + 1);
  const failingByCategory = [...failCats.entries()].sort((a, b) => b[1] - a[1]);

  // First vs last audited version per project: did failing requirements go down?
  const trajectories = projects
    .map((p) => {
      const arts = artifacts.filter((a) => a.projectId === p.id && latestByArtifact.has(a.id)).sort((a, b) => a.version - b.version);
      if (arts.length < 2) return null;
      const count = (artId: string) => findings.filter((f) => f.evaluationId === latestByArtifact.get(artId)!.id && f.checkKey.startsWith("req:") && isFailing(f.status)).length;
      return { project: p.name, id: p.id, first: { v: arts[0].version, failing: count(arts[0].id) }, last: { v: arts.at(-1)!.version, failing: count(arts.at(-1)!.id) } };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const methodCounts = { deterministic: 0, browser: 0, model: 0, human: 0 } as Record<string, number>;
  for (const f of latestFindings) methodCounts[f.method] = (methodCounts[f.method] ?? 0) + 1;

  // Fix success: issues a fix prompt targeted that the next version resolved.
  const byTool = new Map<string, { attempted: number; resolved: number }>();
  const fix = { attempted: 0, resolved: 0, rounds: 0 };
  for (const e of complete) {
    const t = e.summary.fixTracking;
    if (!t) continue;
    fix.attempted += t.attempted;
    fix.resolved += t.resolved;
    fix.rounds++;
    const key = t.tool.trim() || "Unspecified";
    const r = byTool.get(key) ?? { attempted: 0, resolved: 0 };
    r.attempted += t.attempted;
    r.resolved += t.resolved;
    byTool.set(key, r);
  }

  return {
    fix: { ...fix, byTool: [...byTool.entries()].sort((a, b) => b[1].attempted - a[1].attempted) },
    totals: { projects: projects.length, originals: originals.length, outputs: artifacts.length, audits: complete.length, corrections: prompts.filter((p) => p.kind === "correction").length },
    gaps,
    failingByCategory,
    trajectories,
    methodCounts,
  };
}
