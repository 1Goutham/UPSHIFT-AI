import { describe, expect, it } from "vitest";

describe("shares and rate limits (PGlite)", () => {
  it("share tokens are stored hashed, rotate and revoke", async () => {
    const { getDb, schema } = await import("@/lib/db");
    const { createShare, revokeShare, sharedReport } = await import("./share");
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ email: `s-${Date.now()}@x.test`, name: "s", passwordHash: "x" }).returning();
    const [p] = await db.insert(schema.projects).values({ userId: u.id, name: "Shared", goal: "g" }).returning();
    const t1 = await createShare(u.id, p.id);
    const rows = await db.select().from(schema.shares);
    expect(rows.some((r) => r.tokenHash === t1)).toBe(false);
    expect((await sharedReport(t1))?.project.name).toBe("Shared");
    const t2 = await createShare(u.id, p.id);
    expect(await sharedReport(t1)).toBeNull();
    expect((await sharedReport(t2))?.evaluation).toBeNull();
    await revokeShare(u.id, p.id);
    expect(await sharedReport(t2)).toBeNull();
    expect(await sharedReport("../../etc")).toBeNull();
  });

  it("rate limits count across calls and reject past the max", async () => {
    const { rateLimit } = await import("@/lib/security/ratelimit");
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) await rateLimit(key, 3, 60_000);
    await expect(rateLimit(key, 3, 60_000)).rejects.toThrow(/Too many/);
    await rateLimit(`${key}:other`, 3, 60_000);
  });
});
