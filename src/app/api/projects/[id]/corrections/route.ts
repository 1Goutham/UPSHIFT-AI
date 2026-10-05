import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { authed, ApiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { buildCorrectionPrompts, prioritise, redundantCheckIds } from "@/lib/engines/improve";
import { getRequirements, logEvent, requireProject, touchProject } from "@/lib/repo/projects";

const Body = z.object({
  evaluationId: z.string().uuid(),
  findingIds: z.array(z.string().uuid()).min(1, "Select at least one issue.").max(40),
  extra: z.string().max(2000).default(""),
});

const KIND_LABEL: Record<string, string> = { url: "website", image: "image/design", text: "text output", code: "code" };

/** Turn selected findings into a targeted correction prompt (deterministic). */
export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const project = await requireProject(user.id, id);
  const body = await parseBody(req, Body);
  const db = await getDb();
  const [evaluation] = await db
    .select()
    .from(schema.evaluations)
    .where(and(eq(schema.evaluations.id, body.evaluationId), eq(schema.evaluations.projectId, project.id)))
    .limit(1);
  if (!evaluation) throw new ApiError(404, "Evaluation not found.");
  const [artifact] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, evaluation.artifactId)).limit(1);
  const all = await db.select().from(schema.findings).where(eq(schema.findings.evaluationId, evaluation.id));
  const selectedRaw = all.filter((f) => body.findingIds.includes(f.id));
  if (!selectedRaw.length) throw new ApiError(400, "None of the selected issues belong to this evaluation.");
  const priorities = new Map((await getRequirements(project.id)).map((r) => [r.id, r.priority]));
  const redundant = redundantCheckIds(selectedRaw);
  const selected = prioritise(selectedRaw.filter((f) => !redundant.has(f.id)), priorities);
  const skipped = selectedRaw.length - selected.length;
  if (!selected.length) throw new ApiError(400, "Selected items are not failing, so there is nothing to correct.");
  const parts = buildCorrectionPrompts({
    goal: project.goal,
    targetTool: project.targetTool,
    artifactLabel: KIND_LABEL[artifact.kind] ?? "result",
    selected,
    passing: all,
    extraInstruction: body.extra,
  });
  const [prompt] = await db
    .insert(schema.prompts)
    .values({
      projectId: project.id,
      kind: "correction",
      targetTool: project.targetTool,
      content: parts.join("\n\n"),
      method: "deterministic",
      analysis: { parts: parts.length > 1 ? parts : undefined, findingIds: selected.map((f) => f.id), checkKeys: selected.map((f) => f.checkKey), sourceVersion: artifact.version, instruction: body.extra || undefined, changes: [{ change: `Built from ${selected.length} issue(s) in version ${artifact.version}`, reason: "Targeted fix; everything else is to be preserved." }] },
    })
    .returning();
  await logEvent(user.id, project.id, "correction.created", { promptId: prompt.id, issues: selected.length, version: artifact.version });
  await touchProject(project.id);
  return { prompt, skipped };
});
