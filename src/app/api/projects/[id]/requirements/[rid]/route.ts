import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { authed, ApiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { CATEGORIES, PRIORITIES } from "@/lib/engines/taxonomy";
import { logEvent, requireProject, touchProject } from "@/lib/repo/projects";

type P = { id: string; rid: string };

const Patch = z.object({
  text: z.string().trim().min(3).max(500).optional(),
  category: z.enum(CATEGORIES).optional(),
  acceptance: z.string().max(500).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(["proposed", "confirmed", "rejected"]).optional(),
});

async function owned(userId: string, projectId: string, rid: string) {
  const project = await requireProject(userId, projectId);
  if (!/^[0-9a-f-]{36}$/i.test(rid)) throw new ApiError(404, "Requirement not found.");
  return project;
}

export const PATCH = authed<P>(async (req, user, { id, rid }) => {
  const project = await owned(user.id, id, rid);
  const body = await parseBody(req, Patch);
  const db = await getDb();
  const [row] = await db
    .update(schema.requirements)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(schema.requirements.id, rid), eq(schema.requirements.projectId, project.id)))
    .returning();
  if (!row) throw new ApiError(404, "Requirement not found.");
  await logEvent(user.id, project.id, "requirement.updated", { requirementId: rid, fields: Object.keys(body), status: body.status });
  await touchProject(project.id);
  return { requirement: row };
});

export const DELETE = authed<P>(async (_req, user, { id, rid }) => {
  const project = await owned(user.id, id, rid);
  const db = await getDb();
  const rows = await db
    .delete(schema.requirements)
    .where(and(eq(schema.requirements.id, rid), eq(schema.requirements.projectId, project.id)))
    .returning({ text: schema.requirements.text });
  if (!rows.length) throw new ApiError(404, "Requirement not found.");
  await logEvent(user.id, project.id, "requirement.deleted", { text: rows[0].text });
  return { ok: true };
});
