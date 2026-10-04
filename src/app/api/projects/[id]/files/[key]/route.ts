import { eq } from "drizzle-orm";
import { authed, ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { requireProject } from "@/lib/repo/projects";
import { getObject } from "@/lib/storage";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/** Serve an upload or screenshot, only if it belongs to a project the user owns. */
export const GET = authed<{ id: string; key: string }>(async (_req, user, { id, key }) => {
  const project = await requireProject(user.id, id);
  const db = await getDb();
  const [arts, evals] = await Promise.all([
    db.select({ k: schema.artifacts.storageKey }).from(schema.artifacts).where(eq(schema.artifacts.projectId, project.id)),
    db.select({ s: schema.evaluations.summary }).from(schema.evaluations).where(eq(schema.evaluations.projectId, project.id)),
  ]);
  const owned = new Set([...arts.map((a) => a.k), ...evals.flatMap((e) => (e.s.screenshots ?? []).map((s) => s.key))]);
  if (!owned.has(key)) throw new ApiError(404, "File not found.");
  const ext = key.split(".").pop() ?? "";
  const type = TYPES[ext];
  if (!type) throw new ApiError(404, "File not found.");
  const data = await getObject(key).catch(() => null);
  if (!data) throw new ApiError(404, "File not found.");
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=3600",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
});
