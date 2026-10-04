import "server-only";
import { ApiError } from "@/lib/api";

/**
 * Fixed-window limiter kept in process memory. Good enough for a single
 * instance; replace with a shared store (Redis/Postgres) when scaling out.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const wait = Math.ceil((windowMs - (now - recent[0])) / 1000);
    throw new ApiError(429, `Too many requests. Try again in ${wait}s.`);
  }
  recent.push(now);
  buckets.set(key, recent);
}

export const limits = {
  auth: (ip: string) => rateLimit(`auth:${ip}`, 10, 10 * 60_000),
  model: (userId: string) => rateLimit(`model:${userId}`, 40, 60 * 60_000),
  audit: (userId: string) => rateLimit(`audit:${userId}`, 30, 60 * 60_000),
};
