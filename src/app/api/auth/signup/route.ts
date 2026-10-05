import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ApiError, assertSameOrigin, errorResponse, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { createSession, currentUser } from "@/lib/auth/session";
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
    const guest = await currentUser();
    const passwordHash = await hashPassword(body.password);
    if (guest?.isGuest) {
      // Keep everything the visitor already audited: upgrade the guest in place.
      await db.update(schema.users).set({ name: body.name, email: body.email, passwordHash, isGuest: false }).where(eq(schema.users.id, guest.id));
      await createSession(guest.id);
    } else {
      const [user] = await db.insert(schema.users).values({ name: body.name, email: body.email, passwordHash }).returning({ id: schema.users.id });
      await createSession(user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
