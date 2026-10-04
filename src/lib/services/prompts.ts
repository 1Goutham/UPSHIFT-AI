import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Project } from "@/lib/db/schema";
import { ApiError } from "@/lib/api";
import { generateStructured, INJECTION_RULE, providerStatus, untrusted } from "@/lib/ai/provider";
import { lintPrompt } from "@/lib/engines/prompt-lint";
import { assemblePrompt, OptimizedPromptSchema, RefinedPromptSchema } from "@/lib/engines/prompt-builder";
import { getRequirements, logEvent, touchProject } from "@/lib/repo/projects";
import { listMemories } from "@/lib/repo/memory";

const OPTIMIZE_SYSTEM = `You are the prompt intelligence engine of UPSHIFT. Improve a user's prompt for an AI tool.

Principles:
- Preserve the user's intent, voice, explicit requirements and decisions already made. Never silently drop anything they asked for.
- Longer is not better. Add only what makes the instructions more precise, complete, relevant or checkable. Remove filler.
- Use the confirmed requirements as the source of truth; they were reviewed by the user.
- Adapt structure to the task. Not every prompt needs every section (objective, context, requirements, constraints, references, output format, quality criteria, exclusions, validation).
- Replace undefined quality words ("premium", "modern") with concrete, observable descriptions only when the requirements or context support it; otherwise keep them and list an assumption.
- Tool-specific advice goes in toolNotes, only if you are confident about how that tool behaves. General advice does not belong there.
- Do not invent facts about the user, their brand or their content. Use clearly marked placeholders like {{company name}} when content is missing.
${INJECTION_RULE}`;

export async function saveOriginalPrompt(userId: string, project: Project, content: string) {
  const db = await getDb();
  const weaknesses = lintPrompt(content, { contentType: project.contentType });
  const [row] = await db
    .insert(schema.prompts)
    .values({ projectId: project.id, kind: "original", content, targetTool: project.targetTool, method: "user", analysis: { weaknesses } })
    .returning();
  await logEvent(userId, project.id, "prompt.original_saved", { promptId: row.id, weaknesses: weaknesses.length });
  await touchProject(project.id);
  return row;
}

async function loadPrompt(projectId: string, promptId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.prompts)
    .where(and(eq(schema.prompts.id, promptId), eq(schema.prompts.projectId, projectId)))
    .limit(1);
  if (!row) throw new ApiError(404, "Prompt not found.");
  return row;
}

export async function optimizePrompt(userId: string, project: Project, originalId: string, useModel: boolean) {
  const db = await getDb();
  const original = await loadPrompt(project.id, originalId);
  const reqs = (await getRequirements(project.id)).filter((r) => r.status === "confirmed");
  const lint = lintPrompt(original.content, { contentType: project.contentType });
  const answers = (project.brief.questions ?? []).filter((q) => q.answer).map((q) => ({ question: q.question, answer: q.answer! }));

  if (useModel && providerStatus().configured) {
    const memories = (await listMemories(userId)).filter((m) => m.kind === "preference" || m.kind === "pattern" || m.kind === "tool");
    const { data, model } = await generateStructured({
      operation: "prompt.optimize",
      userId,
      projectId: project.id,
      system: OPTIMIZE_SYSTEM,
      effort: "medium",
      schema: OptimizedPromptSchema,
      content: [
        {
          type: "text",
          text: [
            `Output type: ${project.contentType}`,
            `Target tool: ${project.targetTool || "not specified (keep the prompt tool-agnostic)"}`,
            untrusted("user goal", project.goal || "(none)"),
            untrusted("original prompt", original.content),
            reqs.length
              ? untrusted("confirmed requirements", reqs.map((r) => `- [${r.priority}] (${r.category}) ${r.text}${r.acceptance ? ` | check: ${r.acceptance}` : ""}`).join("\n"))
              : "No requirements confirmed yet.",
            answers.length ? untrusted("answers to clarifying questions", answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n")) : "",
            memories.length ? untrusted("user's saved preferences (apply where relevant)", memories.map((m) => `- ${m.content}`).join("\n")) : "",
            `Deterministic checks already flagged: ${lint.map((l) => l.label).join("; ") || "nothing"}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });
    const weaknesses = [
      ...lint,
      ...data.weaknesses.map((w, i) => ({ id: `m${i}`, label: w.label, detail: w.detail, severity: w.severity, source: "model" as const })),
    ];
    const [row] = await db
      .insert(schema.prompts)
      .values({
        projectId: project.id,
        parentId: original.id,
        kind: "optimized",
        targetTool: project.targetTool,
        content: data.improved,
        concise: data.concise,
        detailed: data.detailed,
        method: "model",
        model,
        analysis: { weaknesses, changes: data.changes, preserved: data.preserved, assumptions: data.assumptions, toolNotes: data.toolNotes },
      })
      .returning();
    await logEvent(userId, project.id, "prompt.optimized", { promptId: row.id, method: "model" });
    await touchProject(project.id);
    return row;
  }

  if (!reqs.length) throw new ApiError(400, "Confirm at least one requirement in the brief first. The structured prompt is assembled from confirmed requirements.");
  const base = { goal: project.goal, original: original.content, targetTool: project.targetTool, requirements: reqs, answers };
  const [row] = await db
    .insert(schema.prompts)
    .values({
      projectId: project.id,
      parentId: original.id,
      kind: "optimized",
      targetTool: project.targetTool,
      content: assemblePrompt(base),
      concise: assemblePrompt({ ...base, variant: "concise" }),
      method: "deterministic",
      analysis: {
        weaknesses: lint,
        changes: [
          { change: "Organised into goal, requirements, exclusions and completion checks", reason: "Gives the tool a clear structure to follow and check against." },
          { change: `Added ${reqs.length} confirmed requirement(s)`, reason: "Makes decisions from your brief explicit instead of implied." },
          ...(reqs.some((r) => r.acceptance)
            ? [{ change: "Added a 'Done when' list from acceptance checks", reason: "Lets the tool verify its own output." }]
            : []),
        ],
        preserved: ["Your original prompt is included verbatim as context."],
      },
    })
    .returning();
  await logEvent(userId, project.id, "prompt.optimized", { promptId: row.id, method: "deterministic" });
  await touchProject(project.id);
  return row;
}

export async function refinePrompt(userId: string, project: Project, promptId: string, instruction: string) {
  if (!providerStatus().configured) throw new ApiError(503, "Refining with follow-up instructions needs a configured AI provider. You can edit the prompt text directly instead.", "provider_not_configured");
  const db = await getDb();
  const base = await loadPrompt(project.id, promptId);
  const { data, model } = await generateStructured({
    operation: "prompt.refine",
    userId,
    projectId: project.id,
    system: `${OPTIMIZE_SYSTEM}\n\nYou are revising an existing prompt according to the user's follow-up instruction. Change only what the instruction requires.`,
    effort: "low",
    schema: RefinedPromptSchema,
    content: [{ type: "text", text: [untrusted("current prompt", base.content), `User instruction: ${instruction}`].join("\n\n") }],
  });
  const [row] = await db
    .insert(schema.prompts)
    .values({
      projectId: project.id,
      parentId: base.id,
      kind: "refined",
      targetTool: base.targetTool,
      content: data.improved,
      method: "model",
      model,
      analysis: { changes: data.changes, instruction },
    })
    .returning();
  await logEvent(userId, project.id, "prompt.refined", { promptId: row.id });
  await touchProject(project.id);
  return row;
}

/** Save a user-edited copy of a prompt as a new version (never overwrites). */
export async function saveEditedPrompt(userId: string, project: Project, parentId: string, content: string) {
  const db = await getDb();
  const parent = await loadPrompt(project.id, parentId);
  const [row] = await db
    .insert(schema.prompts)
    .values({ projectId: project.id, parentId: parent.id, kind: parent.kind === "correction" ? "correction" : "refined", targetTool: parent.targetTool, content, method: "user", analysis: { instruction: "Edited by you" } })
    .returning();
  await logEvent(userId, project.id, "prompt.edited", { promptId: row.id });
  return row;
}
