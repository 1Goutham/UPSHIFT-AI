import { NextResponse } from "next/server";
import { sharedReport } from "@/lib/services/share";
import { getObject } from "@/lib/storage";
import { limits } from "@/lib/security/ratelimit";
import { ApiError } from "@/lib/api";

/** Screenshots of the shared audit only. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; key: string }> }) {
  const { token, key } = await ctx.params;
  try {
    await limits.share(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local");
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const report = await sharedReport(token);
  if (!report?.evaluation?.screenshots.some((s) => s.key === key)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const data = await getObject(key).catch(() => null);
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=600", "x-robots-tag": "noindex", "content-security-policy": "default-src 'none'; sandbox" },
  });
}
