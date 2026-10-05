import { and, eq } from "drizzle-orm";
import { authed, ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const DELETE = authed<{ rid: string }>(async (_req, user, { rid }) => {
  if (!/^[0-9a-f-]{36}$/i.test(rid)) throw new ApiError(404, "Not found.");
  const db = await getDb();
  await db.delete(schema.refinements).where(and(eq(schema.refinements.id, rid), eq(schema.refinements.userId, user.id)));
  return { ok: true };
});
