import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";

export const SESSION_COOKIE = "upshift_session";
const SESSION_DAYS = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ id: sha256(token), userId, expiresAt });
  // Opportunistic cleanup of this user's expired sessions.
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), lt(schema.sessions.expiresAt, new Date())));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export type SessionUser = Pick<User, "id" | "email" | "name" | "isGuest">;

/** The signed-in user, or null. Never trusts anything but the session table. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, isGuest: schema.users.isGuest })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Anonymous visitor: a real (but temporary) account so the whole app works
 * before sign-up. Signing up later upgrades this same row; signing in to an
 * existing account moves its projects over.
 */
export async function createGuest(): Promise<SessionUser> {
  const db = await getDb();
  const id = randomBytes(12).toString("hex");
  const [user] = await db
    .insert(schema.users)
    .values({ email: `guest-${id}@guest.invalid`, name: "Guest", passwordHash: "!", isGuest: true })
    .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, isGuest: schema.users.isGuest });
  await createSession(user.id);
  return user;
}
