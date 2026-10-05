import "server-only";
import { imageSize } from "image-size";
import { getDb, schema } from "@/lib/db";
import type { Project } from "@/lib/db/schema";
import { ApiError } from "@/lib/api";
import { and, asc, eq } from "drizzle-orm";
import { deleteObject, getObject, putObject } from "@/lib/storage";
import type { ContentBlock } from "@/lib/ai/provider";
import { assertPublicHost, UnsafeUrlError, validateUrlShape } from "@/lib/security/ssrf";
import { isCodeExtension, looksLikeText, MAX_IMAGE_BYTES, MAX_TEXT_BYTES, sniffImage, textExtension } from "@/lib/security/upload";
import { logEvent, nextArtifactVersion, touchProject } from "@/lib/repo/projects";

type Common = { label: string; note: string };

async function insert(userId: string, project: Project, values: Omit<typeof schema.artifacts.$inferInsert, "projectId" | "version">) {
  const db = await getDb();
  // Retry once if two uploads race for the same version number.
  for (let attempt = 0; attempt < 2; attempt++) {
    const version = await nextArtifactVersion(project.id);
    try {
      const [row] = await db.insert(schema.artifacts).values({ ...values, projectId: project.id, version }).returning();
      await logEvent(userId, project.id, "artifact.added", { artifactId: row.id, version, kind: row.kind });
      await touchProject(project.id);
      return row;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new ApiError(409, "Could not save the output. Please retry.");
}

export async function addUrlArtifact(userId: string, project: Project, rawUrl: string, c: Common) {
  let url: URL;
  try {
    url = validateUrlShape(rawUrl);
    await assertPublicHost(url.hostname);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new ApiError(400, err.message);
    throw err;
  }
  return insert(userId, project, { kind: "url", sourceUrl: url.toString(), label: c.label || url.hostname, note: c.note, meta: {} });
}

export async function addFileArtifact(userId: string, project: Project, file: File, c: Common) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!buf.length) throw new ApiError(400, "The file is empty.");
  const img = await readImage(buf);
  if (img) {
    const key = await putObject(buf, img.ext);
    return insert(userId, project, {
      kind: "image",
      storageKey: key,
      mime: img.mime,
      sizeBytes: buf.length,
      label: c.label || file.name.slice(0, 120),
      note: c.note,
      meta: { width: img.width, height: img.height, format: img.ext, fileName: file.name.slice(0, 200) },
    });
  }
  const ext = textExtension(file.name);
  if (!ext) throw new ApiError(415, "Unsupported file type. Upload a PNG, JPEG, WebP or GIF image, or a text/code file (.md, .txt, .html, .tsx, …).");
  if (buf.length > MAX_TEXT_BYTES) throw new ApiError(413, `Text files can be up to ${MAX_TEXT_BYTES / 1024} KB.`);
  if (!looksLikeText(buf)) throw new ApiError(415, "That file does not look like text.");
  const text = new TextDecoder().decode(buf);
  return addTextArtifact(userId, project, text, { ...c, label: c.label || file.name.slice(0, 120) }, isCodeExtension(ext) ? "code" : "text", ext);
}

export async function addTextArtifact(userId: string, project: Project, text: string, c: Common, kind: "text" | "code", language?: string) {
  if (!text.trim()) throw new ApiError(400, "Paste some text first.");
  if (Buffer.byteLength(text) > MAX_TEXT_BYTES) throw new ApiError(413, `Text can be up to ${MAX_TEXT_BYTES / 1024} KB.`);
  return insert(userId, project, {
    kind,
    textContent: text,
    sizeBytes: Buffer.byteLength(text),
    label: c.label || (kind === "code" ? "Code" : "Text output"),
    note: c.note,
    meta: { lines: text.split("\n").length, language },
  });
}

/** Validate an image by its bytes. Returns null when the bytes are not a supported image. */
export async function readImage(buf: Uint8Array) {
  const img = sniffImage(buf);
  if (!img) return null;
  if (buf.length > MAX_IMAGE_BYTES) throw new ApiError(413, `Images can be up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
  let dims: { width?: number; height?: number } = {};
  try {
    dims = imageSize(buf);
  } catch {
    throw new ApiError(400, "The image could not be read. It may be corrupted.");
  }
  if ((dims.width ?? 0) > 12000 || (dims.height ?? 0) > 12000) throw new ApiError(400, "Images larger than 12000px on a side are not supported.");
  return { ...img, width: dims.width, height: dims.height };
}

const MAX_REFERENCES = 6;

export async function addReferenceImage(userId: string, project: Project, file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!buf.length) throw new ApiError(400, "The file is empty.");
  const img = await readImage(buf);
  if (!img) throw new ApiError(415, "References must be PNG, JPEG, WebP or GIF images.");
  const db = await getDb();
  const existing = await db.select({ id: schema.referenceImages.id }).from(schema.referenceImages).where(eq(schema.referenceImages.projectId, project.id));
  if (existing.length >= MAX_REFERENCES) throw new ApiError(400, `Up to ${MAX_REFERENCES} reference images per project.`);
  const key = await putObject(buf, img.ext);
  const [row] = await db
    .insert(schema.referenceImages)
    .values({ projectId: project.id, storageKey: key, mime: img.mime, sizeBytes: buf.length, width: img.width, height: img.height, label: file.name.slice(0, 120) })
    .returning();
  await logEvent(userId, project.id, "reference.added", { name: row.label });
  await touchProject(project.id);
  return row;
}

export async function deleteReferenceImage(userId: string, project: Project, id: string) {
  const db = await getDb();
  const [row] = await db
    .delete(schema.referenceImages)
    .where(and(eq(schema.referenceImages.id, id), eq(schema.referenceImages.projectId, project.id)))
    .returning();
  if (!row) throw new ApiError(404, "Reference not found.");
  await deleteObject(row.storageKey).catch(() => {});
  await logEvent(userId, project.id, "reference.removed", { name: row.label });
}

/** Up to `max` reference images as model content blocks. */
export async function referenceBlocks(projectId: string, max = 4): Promise<ContentBlock[]> {
  const db = await getDb();
  const refs = await db.select().from(schema.referenceImages).where(eq(schema.referenceImages.projectId, projectId)).orderBy(asc(schema.referenceImages.createdAt)).limit(max);
  const blocks: ContentBlock[] = [];
  for (const r of refs) {
    const data = await getObject(r.storageKey).catch(() => null);
    if (!data) continue;
    blocks.push({ type: "image", source: { type: "base64", media_type: r.mime as "image/png", data: data.toString("base64") } });
  }
  return blocks.length ? [{ type: "text", text: `${blocks.length} reference image(s) supplied by the user as the target look:` }, ...blocks] : [];
}
