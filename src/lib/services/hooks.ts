import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { logEvent } from "@/lib/repo/projects";
import { addUrlArtifact } from "@/lib/services/artifacts";
import { startEvaluation } from "@/lib/services/audit";
import { ApiError } from "@/lib/api";
import { limits } from "@/lib/security/ratelimit";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createHook(userId: string, projectId: string) {
  const db = await getDb();
  const token = randomBytes(24).toString("base64url");
  await db.delete(schema.hooks).where(eq(schema.hooks.projectId, projectId));
  await db.insert(schema.hooks).values({ projectId, tokenHash: sha(token) });
  await logEvent(userId, projectId, "hook.created", {});
  return token;
}

export async function deleteHook(userId: string, projectId: string) {
  const db = await getDb();
  await db.delete(schema.hooks).where(eq(schema.hooks.projectId, projectId));
  await logEvent(userId, projectId, "hook.removed", {});
}

/** Called by CI after a deploy: audits the project's latest URL as a new version. */
export async function fireHook(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new ApiError(404, "Not found.");
  const db = await getDb();
  const [hook] = await db.select().from(schema.hooks).where(eq(schema.hooks.tokenHash, sha(token))).limit(1);
  if (!hook) throw new ApiError(404, "Not found.");
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, hook.projectId)).limit(1);
  await limits.hook(project.id);
  const [last] = await db
    .select()
    .from(schema.artifacts)
    .where(and(eq(schema.artifacts.projectId, project.id), eq(schema.artifacts.kind, "url")))
    .orderBy(desc(schema.artifacts.version))
    .limit(1);
  if (!last?.sourceUrl) throw new ApiError(409, "This project has no URL to re-audit yet.");
  const artifact = await addUrlArtifact(project.userId, project, last.sourceUrl, { label: last.label, note: "After deploy" });
  const { evaluation } = await startEvaluation(project.userId, project.id, artifact.id);
  await db.update(schema.hooks).set({ lastRunAt: new Date() }).where(eq(schema.hooks.id, hook.id));
  return { userId: project.userId, projectId: project.id, evaluationId: evaluation.id, version: artifact.version };
}
