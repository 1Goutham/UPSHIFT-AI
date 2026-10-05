import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, dbDriver } from "@/lib/db";
import { providerStatus } from "@/lib/ai/provider";
import { storageBackend } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Liveness + configuration summary. No secrets, no user data. */
export async function GET() {
  const started = Date.now();
  let db = "ok";
  try {
    await (await getDb()).execute(sql`select 1`);
  } catch {
    db = "error";
  }
  const p = providerStatus();
  const body = {
    status: db === "ok" ? "ok" : "degraded",
    db: { driver: dbDriver(), status: db },
    model: { provider: p.provider, configured: p.configured },
    storage: storageBackend(),
    ms: Date.now() - started,
  };
  return NextResponse.json(body, { status: db === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
}
