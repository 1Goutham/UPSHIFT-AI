import "server-only";
import { imageSize } from "image-size";
import { getDb, schema } from "@/lib/db";
import type { Project } from "@/lib/db/schema";
import { ApiError } from "@/lib/api";
import { putObject } from "@/lib/storage";
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
  const img = sniffImage(buf);
  if (img) {
    if (buf.length > MAX_IMAGE_BYTES) throw new ApiError(413, `Images can be up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
    let dims: { width?: number; height?: number; type?: string } = {};
    try {
      dims = imageSize(buf);
    } catch {
      throw new ApiError(400, "The image could not be read. It may be corrupted.");
    }
    if ((dims.width ?? 0) > 12000 || (dims.height ?? 0) > 12000) throw new ApiError(400, "Images larger than 12000px on a side are not supported.");
    const key = await putObject(buf, img.ext);
    return insert(userId, project, {
      kind: "image",
      storageKey: key,
      mime: img.mime,
      sizeBytes: buf.length,
      label: c.label || file.name.slice(0, 120),
      note: c.note,
      meta: { width: dims.width, height: dims.height, format: img.ext, fileName: file.name.slice(0, 200) },
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
