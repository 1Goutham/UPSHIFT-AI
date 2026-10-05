import { z } from "zod";
import { eq } from "drizzle-orm";
import { authed, ApiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { deleteProject, listProjects } from "@/lib/repo/projects";

const Body = z.object({ password: z.string().min(1).max(200) });

/** Permanently delete the account, every project and every stored file. */
export const DELETE = authed(async (req, user) => {
  const { password } = await parseBody(req, Body);
  const db = await getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) throw new ApiError(403, "Password is incorrect.");
  for (const p of await listProjects(user.id)) await deleteProject(user.id, p.id);
  await destroySession();
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  return { ok: true };
});

const Change = z.object({ current: z.string().min(1).max(200), next: z.string().min(10, "Use at least 10 characters.").max(200) });

/** Change password; every other session is signed out. */
export const PATCH = authed(async (req, user) => {
  const body = await parseBody(req, Change);
  const db = await getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(body.current, row.passwordHash))) throw new ApiError(403, "Current password is incorrect.");
  await db.update(schema.users).set({ passwordHash: await hashPassword(body.next) }).where(eq(schema.users.id, user.id));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  await createSession(user.id);
  return { ok: true };
});
