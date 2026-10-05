import "server-only";
import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema";

/**
 * One database handle per process.
 *
 * - DATABASE_URL set   -> PostgreSQL via postgres.js (production).
 * - DATABASE_URL unset -> embedded PGlite (real Postgres compiled to WASM)
 *   persisted under .data/pglite, so the app runs with zero setup. PGlite is
 *   single-process; use a real DATABASE_URL for any shared deployment.
 *
 * Migrations in ./drizzle are applied on first use.
 */
export type DB = PostgresJsDatabase<typeof schema>;

type Holder = { db: Promise<DB> | null; driver: "postgres" | "pglite" | null };
const g = globalThis as unknown as { __upshiftDb?: Holder };
const holder: Holder = (g.__upshiftDb ??= { db: null, driver: null });

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    // Serverless instances each hold a pool; keep it small and let the
    // provider's pooler (e.g. Neon "-pooler" host) fan in.
    const client = postgres(url, { max: process.env.VERCEL ? 3 : 10, idle_timeout: 20, prepare: false });
    const db = drizzlePostgres(client, { schema });
    try {
      await migratePostgres(db, { migrationsFolder: MIGRATIONS });
    } catch (err) {
      // Two cold starts can race on the first deploy; the loser retries once
      // and finds the migrations applied.
      await new Promise((r) => setTimeout(r, 1500));
      await migratePostgres(db, { migrationsFolder: MIGRATIONS }).catch(() => {
        throw err;
      });
    }
    holder.driver = "postgres";
    return db;
  }
  if (process.env.VERCEL) throw new Error("DATABASE_URL is required in serverless deployments (the embedded database cannot persist there).");

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate: migratePglite } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const memory = dir === "memory://";
  if (!memory) fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(memory ? undefined : dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  holder.driver = "pglite";
  // Both drivers expose the same query builder surface.
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!holder.db) {
    holder.db = connect().catch((err) => {
      holder.db = null; // allow a retry on the next request
      throw err;
    });
  }
  return holder.db;
}

export function dbDriver() {
  return holder.driver ?? (process.env.DATABASE_URL ? "postgres" : "pglite");
}

export { schema };
