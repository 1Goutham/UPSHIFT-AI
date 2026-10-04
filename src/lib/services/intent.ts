import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Brief } from "@/lib/db/schema";
import { generateStructured, INJECTION_RULE, providerStatus, untrusted } from "@/lib/ai/provider";
import { BriefSchema, deterministicBrief, type RequirementCandidate } from "@/lib/engines/intent";
import { CONTENT_TYPES, type ContentType } from "@/lib/engines/taxonomy";
import { getRequirements, logEvent, touchProject } from "@/lib/repo/projects";
import type { Project } from "@/lib/db/schema";

const SYSTEM = `You are the intent engine of UPSHIFT, a tool that helps people get better results from AI tools.
Turn a user's goal and original prompt into a precise, editable brief and a requirements checklist that will later be used to evaluate the AI output.

Rules:
- Separate what the user explicitly asked for (origin "explicit") from what you infer (origin "inferred") and from assumptions (origin "assumption"). Never present an inference as something the user said.
- Each requirement must be one testable statement with an observable acceptance check.
- Prefer fewer, sharper requirements over many vague ones. Do not pad.
- Ask at most 3 clarifying questions, only when the answer would materially change the output. Otherwise state an assumption.
- Flag contradictions in "ambiguities".
- Keep the user's own wording where it is already precise.
${INJECTION_RULE}`;

export async function generateBrief(userId: string, project: Project, opts: { prompt: string; useModel: boolean }) {
  const db = await getDb();
  const contentType = project.contentType as ContentType;
  let brief: Brief;
  let candidates: RequirementCandidate[];

  if (opts.useModel && providerStatus().configured) {
    const typeLabel = CONTENT_TYPES.find((c) => c.id === contentType)?.label ?? contentType;
    const { data, model } = await generateStructured({
      operation: "intent.brief",
      userId,
      projectId: project.id,
      system: SYSTEM,
      effort: "medium",
      content: [
        {
          type: "text",
          text: [
            `Output type: ${typeLabel}`,
            project.targetTool ? `Target AI tool: ${project.targetTool}` : "Target AI tool: not specified",
            untrusted("user goal", project.goal || "(none given)"),
            untrusted("original prompt", opts.prompt || "(none given)"),
          ].join("\n\n"),
        },
      ],
      schema: BriefSchema,
    });
    brief = {
      summary: data.summary,
      taskType: data.taskType,
      audience: data.audience,
      objective: data.objective,
      visualDirection: data.visualDirection,
      technicalConstraints: data.technicalConstraints,
      exclusions: data.exclusions,
      ambiguities: data.ambiguities.slice(0, 4),
      questions: data.questions.slice(0, 3).map((q) => ({ id: randomUUID().slice(0, 8), ...q })),
      assumptions: data.assumptions,
      method: `model:${model}`,
    };
    candidates = data.requirements.slice(0, 20);
  } else {
    const d = deterministicBrief({ goal: project.goal, prompt: opts.prompt, contentType });
    brief = d.brief;
    candidates = d.requirements;
  }
  brief.generatedAt = new Date().toISOString();

  // Keep confirmed requirements; replace earlier proposals that were never confirmed.
  const existing = await getRequirements(project.id);
  const keep = existing.filter((r) => r.status !== "proposed");
  const known = new Set(keep.map((r) => r.text.trim().toLowerCase()));
  const fresh = candidates.filter((c) => !known.has(c.text.trim().toLowerCase()));
  // Keep answers the user already gave to questions that survive.
  const prevAnswers = new Map((project.brief.questions ?? []).filter((q) => q.answer).map((q) => [q.question, q.answer]));
  brief.questions = (brief.questions ?? []).map((q) => ({ ...q, answer: prevAnswers.get(q.question) ?? q.answer }));
  await db.transaction(async (tx) => {
    await tx.delete(schema.requirements).where(and(eq(schema.requirements.projectId, project.id), eq(schema.requirements.status, "proposed")));
    if (fresh.length)
      await tx.insert(schema.requirements).values(
        fresh.map((c, i) => ({
          projectId: project.id,
          category: c.category,
          text: c.text,
          acceptance: c.acceptance,
          priority: c.priority,
          origin: c.origin,
          status: "proposed",
          position: keep.length + i,
        })),
      );
    await tx.update(schema.projects).set({ brief, updatedAt: new Date() }).where(eq(schema.projects.id, project.id));
  });
  await logEvent(userId, project.id, "brief.generated", { method: brief.method, candidates: candidates.length });
  await touchProject(project.id);
  return brief;
}
