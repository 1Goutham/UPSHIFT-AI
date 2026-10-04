import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ApiError, assertSameOrigin, errorResponse, parseBody } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { limits } from "@/lib/security/ratelimit";

const Body = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) });

// Compared against when the email is unknown so timing does not reveal accounts.
let dummyHash: Promise<string> | null = null;

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    limits.auth(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local");
    const body = await parseBody(req, Body);
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, body.email)).limit(1);
    dummyHash ??= hashPassword("not-a-real-password");
    const ok = await verifyPassword(body.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) throw new ApiError(401, "Email or password is incorrect.");
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
