import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { deleteObject } from "@/lib/storage";

/**
 * Data access. Every function takes the acting user's id and scopes its query
 * to rows that user owns. Child rows are reached only through an owned project.
 */

export async function requireProject(userId: string, projectId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new ApiError(404, "Project not found.");
  const db = await getDb();
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!p) throw new ApiError(404, "Project not found.");
  return p;
}

export async function touchProject(projectId: string) {
  const db = await getDb();
  await db.update(schema.projects).set({ updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
}

export async function logEvent(userId: string, projectId: string | null, type: string, detail: Record<string, unknown> = {}) {
  const db = await getDb();
  await db.insert(schema.events).values({ userId, projectId, type, detail });
}

export async function listProjects(userId: string) {
  const db = await getDb();
  return db.select().from(schema.projects).where(eq(schema.projects.userId, userId)).orderBy(desc(schema.projects.updatedAt));
}

export async function deleteProject(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  const db = await getDb();
  const files = await db.select({ key: schema.artifacts.storageKey }).from(schema.artifacts).where(eq(schema.artifacts.projectId, projectId));
  const evals = await db.select({ summary: schema.evaluations.summary }).from(schema.evaluations).where(eq(schema.evaluations.projectId, projectId));
  const keys = [...files.map((f) => f.key), ...evals.flatMap((e) => (e.summary.screenshots ?? []).map((s) => s.key))].filter((k): k is string => !!k);
  await db.delete(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));
  // Remove stored uploads and screenshots after the rows are gone.
  for (const k of keys) await deleteObject(k).catch(() => {});
}

export async function nextArtifactVersion(projectId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ v: schema.artifacts.version })
    .from(schema.artifacts)
    .where(eq(schema.artifacts.projectId, projectId))
    .orderBy(desc(schema.artifacts.version))
    .limit(1);
  return (row?.v ?? 0) + 1;
}

export async function getRequirements(projectId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.requirements)
    .where(eq(schema.requirements.projectId, projectId))
    .orderBy(asc(schema.requirements.position), asc(schema.requirements.createdAt));
}

export async function getWorkspace(userId: string, projectId: string) {
  const project = await requireProject(userId, projectId);
  const db = await getDb();
  const [requirements, prompts, artifacts, evaluations, events] = await Promise.all([
    getRequirements(projectId),
    db.select().from(schema.prompts).where(eq(schema.prompts.projectId, projectId)).orderBy(desc(schema.prompts.createdAt)),
    db.select().from(schema.artifacts).where(eq(schema.artifacts.projectId, projectId)).orderBy(desc(schema.artifacts.version)),
    db.select().from(schema.evaluations).where(eq(schema.evaluations.projectId, projectId)).orderBy(desc(schema.evaluations.createdAt)),
    db.select().from(schema.events).where(eq(schema.events.projectId, projectId)).orderBy(desc(schema.events.createdAt)).limit(80),
  ]);
  const evalIds = evaluations.map((e) => e.id);
  const findings = evalIds.length
    ? await db.select().from(schema.findings).where(inArray(schema.findings.evaluationId, evalIds)).orderBy(asc(schema.findings.position))
    : [];
  return { project, requirements, prompts, artifacts, evaluations, findings, events };
}

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
