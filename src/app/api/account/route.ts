import { z } from "zod";
import { eq } from "drizzle-orm";
import { authed, ApiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { destroySession } from "@/lib/auth/session";
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
