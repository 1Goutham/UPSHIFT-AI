import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Object storage for uploads. The local-disk backend keeps files under
 * .data/uploads (or UPSHIFT_STORAGE_DIR). Keys are server-generated UUIDs, so
 * user input never becomes part of a path. A cloud backend (S3/R2/GCS) can
 * replace these three functions without touching callers.
 */
const ROOT = process.env.UPSHIFT_STORAGE_DIR ?? path.join(process.cwd(), ".data", "uploads");

function keyPath(key: string) {
  if (!/^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/.test(key)) throw new Error("Invalid storage key");
  return path.join(ROOT, key);
}

export async function putObject(data: Uint8Array, ext: string): Promise<string> {
  await fs.mkdir(ROOT, { recursive: true });
  const key = `${randomUUID()}.${ext}`;
  await fs.writeFile(keyPath(key), data, { mode: 0o600 });
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  return fs.readFile(keyPath(key));
}

export async function deleteObject(key: string): Promise<void> {
  await fs.rm(keyPath(key), { force: true });
}
