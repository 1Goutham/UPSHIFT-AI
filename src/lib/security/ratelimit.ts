import "server-only";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

/**
 * Sliding-window limiter stored in Postgres, so limits hold across
 * serverless instances. Old hits are pruned opportunistically.
 */
export async function rateLimit(key: string, max: number, windowMs: number) {
  const db = await getDb();
  const since = new Date(Date.now() - windowMs);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.rateHits)
    .where(and(eq(schema.rateHits.key, key), gte(schema.rateHits.at, since)));
  if (n >= max) throw new ApiError(429, "Too many requests. Try again shortly.");
  await db.insert(schema.rateHits).values({ key });
  if (Math.random() < 0.02) await db.delete(schema.rateHits).where(lt(schema.rateHits.at, new Date(Date.now() - 24 * 3600_000)));
}

export const limits = {
  auth: (ip: string) => rateLimit(`auth:${ip}`, Number(process.env.UPSHIFT_AUTH_RATE_LIMIT) || 10, 10 * 60_000),
  model: (userId: string) => rateLimit(`model:${userId}`, 60, 60 * 60_000),
  audit: (userId: string) => rateLimit(`audit:${userId}`, 30, 60 * 60_000),
  share: (ip: string) => rateLimit(`share:${ip}`, 120, 10 * 60_000),
};
