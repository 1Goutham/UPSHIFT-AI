import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { authed, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { getRequirements, logEvent, requireProject } from "@/lib/repo/projects";

export const GET = authed(async (_req, user) => {
  const db = await getDb();
  return { playbooks: await db.select().from(schema.playbooks).where(eq(schema.playbooks.userId, user.id)).orderBy(desc(schema.playbooks.createdAt)) };
});

const Body = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).default(""),
  includePrompt: z.boolean().default(true),
});

/** Save a project's confirmed requirements (and latest improved prompt) as a reusable playbook. */
export const POST = authed(async (req, user) => {
  const body = await parseBody(req, Body);
  const project = await requireProject(user.id, body.projectId);
  const reqs = (await getRequirements(project.id)).filter((r) => r.status === "confirmed");
  const db = await getDb();
  const [prompt] = body.includePrompt
    ? await db.select().from(schema.prompts).where(eq(schema.prompts.projectId, project.id)).orderBy(desc(schema.prompts.createdAt))
    : [];
  const template = body.includePrompt ? (prompt && prompt.kind !== "correction" ? prompt.content : "") : "";
  const [playbook] = await db
    .insert(schema.playbooks)
    .values({
      userId: user.id,
      name: body.name,
      description: body.description,
      contentType: project.contentType,
      targetTool: project.targetTool,
      requirements: reqs.map((r) => ({ category: r.category, text: r.text, acceptance: r.acceptance, priority: r.priority })),
      promptTemplate: template,
    })
    .returning();
  await logEvent(user.id, project.id, "playbook.saved", { playbookId: playbook.id, requirements: reqs.length });
  return { playbook };
});
