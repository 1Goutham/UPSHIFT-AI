import { expect } from "vitest";
import { eq } from "drizzle-orm";

/** Shared persistence assertions, run against PGlite and (optionally) real Postgres. */
export async function persistenceSuite() {
  const { getDb, schema } = await import("./index");
  const { requireProject, getWorkspace, deleteProject, nextArtifactVersion } = await import("@/lib/repo/projects");
  const db = await getDb();
  const mk = async (tag: string) =>
    (await db.insert(schema.users).values({ email: `${tag}-${Date.now()}-${Math.random()}@x.test`, name: tag, passwordHash: "x" }).returning())[0];
  const alice = await mk("alice");
  const bob = await mk("bob");
  const [p] = await db.insert(schema.projects).values({ userId: alice.id, name: "A", brief: { summary: "s" } }).returning();

  // Ownership: Bob cannot reach Alice's project through the repo layer.
  expect((await requireProject(alice.id, p.id)).name).toBe("A");
  await expect(requireProject(bob.id, p.id)).rejects.toThrow(/not found/i);
  await expect(deleteProject(bob.id, p.id)).rejects.toThrow(/not found/i);

  // Versions increment per project.
  expect(await nextArtifactVersion(p.id)).toBe(1);
  const [a] = await db.insert(schema.artifacts).values({ projectId: p.id, version: 1, kind: "text", textContent: "hi" }).returning();
  expect(await nextArtifactVersion(p.id)).toBe(2);
  // Duplicate version numbers are rejected by the unique index.
  await expect(db.insert(schema.artifacts).values({ projectId: p.id, version: 1, kind: "text" })).rejects.toThrow();

  const [e] = await db.insert(schema.evaluations).values({ projectId: p.id, artifactId: a.id, status: "complete" }).returning();
  await db.insert(schema.findings).values({ evaluationId: e.id, checkKey: "check:x", title: "t", status: "verified_pass", method: "deterministic" });
  const ws = await getWorkspace(alice.id, p.id);
  expect(ws.findings).toHaveLength(1);
  expect(ws.project.brief.summary).toBe("s");

  // Deleting the project cascades to everything under it.
  await deleteProject(alice.id, p.id);
  expect(await db.select().from(schema.findings).where(eq(schema.findings.evaluationId, e.id))).toHaveLength(0);
  expect(await db.select().from(schema.artifacts).where(eq(schema.artifacts.projectId, p.id))).toHaveLength(0);
}
