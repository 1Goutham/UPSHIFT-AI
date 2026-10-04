import { and, eq } from "drizzle-orm";
import { authed, ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const DELETE = authed<{ bid: string }>(async (_req, user, { bid }) => {
  if (!/^[0-9a-f-]{36}$/i.test(bid)) throw new ApiError(404, "Not found.");
  const db = await getDb();
  await db.delete(schema.playbooks).where(and(eq(schema.playbooks.id, bid), eq(schema.playbooks.userId, user.id)));
  return { ok: true };
});
