import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, type SessionUser } from "@/lib/auth/session";
import { ProviderNotConfiguredError, ProviderError } from "@/lib/ai/provider";

/** An error whose message is safe to show the user. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const notFound = () => new ApiError(404, "Not found.");

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(400, `Invalid input${first?.path.length ? ` at ${first.path.join(".")}` : ""}: ${first?.message ?? "unknown"}`);
  }
  return parsed.data;
}

type Ctx<P> = { params: Promise<P> };

/**
 * Wrap a route handler: requires a session, maps known errors to JSON
 * responses, and never leaks internal error text.
 */
export function authed<P = Record<string, string>>(
  fn: (req: Request, user: SessionUser, params: P) => Promise<Response | unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const user = await currentUser();
      if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
      const out = await fn(req, user, await ctx.params);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Defence in depth on top of SameSite=Lax cookies: state-changing requests must come from our own origin. */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new ApiError(403, "Cross-origin request refused.");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(403, "Cross-origin request refused.");
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  if (err instanceof ProviderNotConfiguredError)
    return NextResponse.json({ error: err.message, code: "provider_not_configured" }, { status: 503 });
  if (err instanceof ProviderError)
    return NextResponse.json({ error: err.message, code: "provider_error" }, { status: err.status ?? 502 });
  console.error("[api] unhandled", err);
  return NextResponse.json({ error: "Something went wrong on our side. Nothing was lost; please try again." }, { status: 500 });
}

/**
 * Like authed(), but also accepts an extension bearer token. Bearer requests
 * skip the same-origin check (they carry no ambient cookie, so CSRF does not
 * apply); cookie requests keep it.
 */
export function authedOrToken<P = Record<string, string>>(fn: (req: Request, user: SessionUser, params: P) => Promise<Response | unknown>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const { userFromBearer } = await import("@/lib/auth/ext-token");
      let user: SessionUser | null = null;
      if (req.headers.get("authorization")) {
        user = await userFromBearer(req);
        if (!user) return NextResponse.json({ error: "This extension token is invalid or was revoked. Reconnect UPSHIFT." }, { status: 401 });
      } else {
        assertSameOrigin(req);
        user = await currentUser();
        if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
      }
      const out = await fn(req, user, await ctx.params);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
