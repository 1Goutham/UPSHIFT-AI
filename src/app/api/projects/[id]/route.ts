import { z } from "zod";
import { eq } from "drizzle-orm";
import { authed, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { CONTENT_TYPE_IDS } from "@/lib/engines/taxonomy";
import { deleteProject, getWorkspace, logEvent, requireProject } from "@/lib/repo/projects";

type P = { id: string };

export const GET = authed<P>(async (_req, user, { id }) => getWorkspace(user.id, id));

const Patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  goal: z.string().max(4000).optional(),
  contentType: z.enum(CONTENT_TYPE_IDS).optional(),
  targetTool: z.string().trim().max(80).optional(),
  brief: z
    .object({
      summary: z.string().max(2000).optional(),
      audience: z.string().max(1000).optional(),
      objective: z.string().max(1000).optional(),
      visualDirection: z.string().max(1000).optional(),
      technicalConstraints: z.string().max(1000).optional(),
      exclusions: z.string().max(1000).optional(),
      answers: z.record(z.string(), z.string().max(2000)).optional(),
    })
    .optional(),
});

export const PATCH = authed<P>(async (req, user, { id }) => {
  const project = await requireProject(user.id, id);
  const body = await parseBody(req, Patch);
  const { brief: briefPatch, ...fields } = body;
  let brief = project.brief;
  if (briefPatch) {
    const { answers, ...rest } = briefPatch;
    brief = { ...brief, ...rest };
    if (answers) brief.questions = (brief.questions ?? []).map((q) => (q.id in answers ? { ...q, answer: answers[q.id] } : q));
  }
  const db = await getDb();
  const [updated] = await db
    .update(schema.projects)
    .set({ ...fields, brief, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id))
    .returning();
  await logEvent(user.id, project.id, "project.updated", { fields: [...Object.keys(fields), ...(briefPatch ? ["brief"] : [])] });
  return { project: updated };
});

export const DELETE = authed<P>(async (_req, user, { id }) => {
  await deleteProject(user.id, id);
  return { ok: true };
});
