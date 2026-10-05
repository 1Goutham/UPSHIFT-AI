import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { authed, ApiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { CONTENT_TYPE_IDS } from "@/lib/engines/taxonomy";
import { listProjects, logEvent } from "@/lib/repo/projects";
import { saveOriginalPrompt } from "@/lib/services/prompts";

export const GET = authed(async (_req, user) => ({ projects: await listProjects(user.id) }));

const Create = z.object({
  name: z.string().trim().max(120).default(""),
  goal: z.string().max(4000).default(""),
  contentType: z.enum(CONTENT_TYPE_IDS).default("website"),
  targetTool: z.string().trim().max(80).default(""),
  originalPrompt: z.string().max(20000).default(""),
  playbookId: z.string().uuid().optional(),
});

export const POST = authed(async (req, user) => {
  const body = await parseBody(req, Create);
  if (!body.name) body.name = nameFrom(body.goal || body.originalPrompt) || "Untitled project";
  const db = await getDb();
  let playbook: typeof schema.playbooks.$inferSelect | undefined;
  if (body.playbookId) {
    [playbook] = await db
      .select()
      .from(schema.playbooks)
      .where(and(eq(schema.playbooks.id, body.playbookId), eq(schema.playbooks.userId, user.id)))
      .limit(1);
    if (!playbook) throw new ApiError(404, "Playbook not found.");
  }
  const [project] = await db
    .insert(schema.projects)
    .values({
      userId: user.id,
      name: body.name,
      goal: body.goal,
      contentType: playbook?.contentType ?? body.contentType,
      targetTool: body.targetTool || playbook?.targetTool || "",
    })
    .returning();
  if (playbook?.requirements.length) {
    await db.insert(schema.requirements).values(
      playbook.requirements.map((r, i) => ({ projectId: project.id, ...r, origin: "explicit", status: "confirmed", position: i })),
    );
  }
  await logEvent(user.id, project.id, "project.created", { playbook: playbook?.name });
  const prompt = body.originalPrompt.trim() || playbook?.promptTemplate.trim();
  if (prompt) await saveOriginalPrompt(user.id, project, prompt);
  return { project };
});

/** A short name from the first words of the goal. */
function nameFrom(text: string) {
  const words = text.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.slice(0, 6).join(" ");
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
}
