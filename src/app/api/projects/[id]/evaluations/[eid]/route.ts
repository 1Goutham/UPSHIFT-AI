import { and, asc, eq } from "drizzle-orm";
import { authed, ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { requireProject } from "@/lib/repo/projects";

export const GET = authed<{ id: string; eid: string }>(async (_req, user, { id, eid }) => {
  const project = await requireProject(user.id, id);
  if (!/^[0-9a-f-]{36}$/i.test(eid)) throw new ApiError(404, "Evaluation not found.");
  const db = await getDb();
  const [evaluation] = await db
    .select()
    .from(schema.evaluations)
    .where(and(eq(schema.evaluations.id, eid), eq(schema.evaluations.projectId, project.id)))
    .limit(1);
  if (!evaluation) throw new ApiError(404, "Evaluation not found.");
  const findings = evaluation.status === "complete" ? await db.select().from(schema.findings).where(eq(schema.findings.evaluationId, eid)).orderBy(asc(schema.findings.position)) : [];
  return { evaluation, findings };
});
