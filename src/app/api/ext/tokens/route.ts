import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { authed, ApiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { createExtToken } from "@/lib/auth/ext-token";

export const GET = authed(async (_req, user) => {
  const db = await getDb();
  const tokens = await db
    .select({ id: schema.extTokens.id, label: schema.extTokens.label, lastUsedAt: schema.extTokens.lastUsedAt, createdAt: schema.extTokens.createdAt })
    .from(schema.extTokens)
    .where(eq(schema.extTokens.userId, user.id))
    .orderBy(desc(schema.extTokens.createdAt));
  return { tokens };
});

const Body = z.object({ label: z.string().trim().max(60).default("Browser extension") });

/** Create a token for the browser extension. Returned once; only its hash is stored. */
export const POST = authed(async (req, user) => {
  if (user.isGuest) throw new ApiError(403, "Create an account to connect the extension.");
  const { label } = await parseBody(req, Body);
  return await createExtToken(user.id, label || "Browser extension");
});
