import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ApiError, assertSameOrigin, errorResponse, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { limits } from "@/lib/security/ratelimit";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limits.auth(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local");
    const body = await parseBody(req, Body);
    const db = await getDb();
    const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, body.email)).limit(1);
    if (existing.length) throw new ApiError(409, "An account with that email already exists. Sign in instead.");
    const [user] = await db
      .insert(schema.users)
      .values({ name: body.name, email: body.email, passwordHash: await hashPassword(body.password) })
      .returning({ id: schema.users.id });
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
