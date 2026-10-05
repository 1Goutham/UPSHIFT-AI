import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api";

/**
 * Object storage for uploads and screenshots.
 *
 * - BLOB_READ_WRITE_TOKEN set -> Vercel Blob, private access. Blob URLs never
 *   reach the browser; files are streamed through the authenticated
 *   /api/projects/:id/files/:key route.
 * - otherwise -> local disk under .data/uploads (or UPSHIFT_STORAGE_DIR).
 *
 * Keys are server-generated UUIDs, so user input never becomes a path.
 */
const ROOT = process.env.UPSHIFT_STORAGE_DIR ?? path.join(process.cwd(), ".data", "uploads");
const PREFIX = "upshift/";
const ACCESS = (process.env.UPSHIFT_BLOB_ACCESS === "public" ? "public" : "private") as "public" | "private";

export const storageBackend = () => (process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "disk");

function checkKey(key: string) {
  if (!/^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/.test(key)) throw new Error("Invalid storage key");
  return key;
}

const CONTENT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

function assertWritableDisk() {
  // Serverless filesystems are read-only or ephemeral: refuse rather than lose files.
  if (process.env.VERCEL) throw new ApiError(503, "File storage is not configured. Connect a Vercel Blob store (BLOB_READ_WRITE_TOKEN).");
}

export async function putObject(data: Uint8Array, ext: string): Promise<string> {
  const key = checkKey(`${randomUUID()}.${ext}`);
  if (storageBackend() === "blob") {
    const { put } = await import("@vercel/blob");
    await put(PREFIX + key, Buffer.from(data), { access: ACCESS, addRandomSuffix: false, contentType: CONTENT_TYPES[ext] ?? "application/octet-stream" });
    return key;
  }
  assertWritableDisk();
  await fs.mkdir(ROOT, { recursive: true });
  await fs.writeFile(path.join(ROOT, key), data, { mode: 0o600 });
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  checkKey(key);
  if (storageBackend() === "blob") {
    const { get } = await import("@vercel/blob");
    const res = await get(PREFIX + key, { access: ACCESS });
    if (!res || res.statusCode !== 200 || !res.stream) throw new Error("Object not found");
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }
  return fs.readFile(path.join(ROOT, key));
}

export async function deleteObject(key: string): Promise<void> {
  checkKey(key);
  if (storageBackend() === "blob") {
    const { del } = await import("@vercel/blob");
    await del(PREFIX + key);
    return;
  }
  await fs.rm(path.join(ROOT, key), { force: true });
}
