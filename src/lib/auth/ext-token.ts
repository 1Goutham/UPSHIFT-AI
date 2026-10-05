import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { SessionUser } from "./session";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createExtToken(userId: string, label: string) {
  const token = `upx_${randomBytes(24).toString("base64url")}`;
  const db = await getDb();
  const [row] = await db.insert(schema.extTokens).values({ userId, tokenHash: sha(token), label }).returning({ id: schema.extTokens.id });
  return { id: row.id, token };
}

/** Resolve "Authorization: Bearer upx_…" to its user. */
export async function userFromBearer(req: Request): Promise<SessionUser | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(upx_[A-Za-z0-9_-]{20,64})$/);
  if (!m) return null;
  const db = await getDb();
  const [row] = await db
    .select({ tokenId: schema.extTokens.id, id: schema.users.id, email: schema.users.email, name: schema.users.name, isGuest: schema.users.isGuest })
    .from(schema.extTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.extTokens.userId))
    .where(eq(schema.extTokens.tokenHash, sha(m[1])))
    .limit(1);
  if (!row || row.isGuest) return null;
  await db.update(schema.extTokens).set({ lastUsedAt: new Date() }).where(eq(schema.extTokens.id, row.tokenId));
  return { id: row.id, email: row.email, name: row.name, isGuest: false };
}

export async function revokeExtToken(userId: string, id: string) {
  const db = await getDb();
  await db.delete(schema.extTokens).where(and(eq(schema.extTokens.id, id), eq(schema.extTokens.userId, userId)));
}
