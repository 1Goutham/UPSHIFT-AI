import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { logEvent } from "@/lib/repo/projects";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** Create a new link (replacing any existing one). The token is returned once. */
export async function createShare(userId: string, projectId: string) {
  const db = await getDb();
  const token = randomBytes(24).toString("base64url");
  await db.delete(schema.shares).where(eq(schema.shares.projectId, projectId));
  await db.insert(schema.shares).values({ projectId, tokenHash: sha(token) });
  await logEvent(userId, projectId, "share.created", {});
  return token;
}

export async function revokeShare(userId: string, projectId: string) {
  const db = await getDb();
  await db.delete(schema.shares).where(eq(schema.shares.projectId, projectId));
  await logEvent(userId, projectId, "share.revoked", {});
}

export async function isShared(projectId: string) {
  const db = await getDb();
  return (await db.select({ id: schema.shares.id }).from(schema.shares).where(eq(schema.shares.projectId, projectId)).limit(1)).length > 0;
}

/**
 * The public report: project goal, confirmed requirements and the latest
 * completed audit. Nothing else (no prompts, history, other versions, notes).
 */
export async function sharedReport(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await getDb();
  const [share] = await db.select().from(schema.shares).where(eq(schema.shares.tokenHash, sha(token))).limit(1);
  if (!share) return null;
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, share.projectId)).limit(1);
  if (!project) return null;
  const evals = await db
    .select()
    .from(schema.evaluations)
    .where(and(eq(schema.evaluations.projectId, project.id), eq(schema.evaluations.status, "complete")))
    .orderBy(desc(schema.evaluations.createdAt))
    .limit(1);
  const evaluation = evals[0] ?? null;
  const [artifact] = evaluation ? await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, evaluation.artifactId)).limit(1) : [];
  const findings = evaluation
    ? await db.select().from(schema.findings).where(inArray(schema.findings.evaluationId, [evaluation.id])).orderBy(asc(schema.findings.position))
    : [];
  return {
    project: { name: project.name, goal: project.goal },
    artifact: artifact ? { version: artifact.version, label: artifact.label, kind: artifact.kind, sourceUrl: artifact.sourceUrl, createdAt: artifact.createdAt } : null,
    evaluation: evaluation ? { createdAt: evaluation.completedAt ?? evaluation.createdAt, requirements: evaluation.requirementSnapshot, screenshots: evaluation.summary.screenshots ?? [], methods: evaluation.summary.methods ?? [] } : null,
    findings: findings.map((f) => ({ id: f.id, checkKey: f.checkKey, title: f.title, detail: f.detail, status: f.status, severity: f.severity, method: f.method, recommendation: f.recommendation })),
  };
}
export type SharedReport = NonNullable<Awaited<ReturnType<typeof sharedReport>>>;
