import { and, eq } from "drizzle-orm";
import { authed } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { logEvent, requireProject } from "@/lib/repo/projects";

/** Confirm every proposed requirement at once. */
export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const project = await requireProject(user.id, id);
  const db = await getDb();
  const rows = await db
    .update(schema.requirements)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(and(eq(schema.requirements.projectId, project.id), eq(schema.requirements.status, "proposed")))
    .returning({ id: schema.requirements.id });
  await logEvent(user.id, project.id, "requirements.confirmed_all", { count: rows.length });
  return { confirmed: rows.length };
});
