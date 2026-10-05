import { desc, eq } from "drizzle-orm";
import { authed } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const GET = authed(async (_req, user) => {
  const db = await getDb();
  const rows = await db.select().from(schema.refinements).where(eq(schema.refinements.userId, user.id)).orderBy(desc(schema.refinements.createdAt)).limit(100);
  return { refinements: rows };
});

/** Clear the whole history. */
export const DELETE = authed(async (_req, user) => {
  const db = await getDb();
  await db.delete(schema.refinements).where(eq(schema.refinements.userId, user.id));
  return { ok: true };
});
