/**
 * Upload validation. The declared MIME type and file name are not trusted;
 * the type is decided from the file's leading bytes.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_BYTES = 512 * 1024;

export type SniffedImage = { mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; ext: string };

export function sniffImage(buf: Uint8Array): SniffedImage | null {
  const b = buf;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return { mime: "image/png", ext: "png" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { mime: "image/webp", ext: "webp" };
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { mime: "image/gif", ext: "gif" };
  return null;
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "html", "htm", "css", "js", "jsx", "ts", "tsx", "json", "py", "rb", "go", "rs", "java", "kt",
  "swift", "php", "vue", "svelte", "yml", "yaml", "toml", "sql", "sh", "xml", "csv",
]);

export function textExtension(name: string) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return TEXT_EXTENSIONS.has(ext) ? ext : null;
}

/** True if the bytes decode as UTF-8 text without control garbage. */
export function looksLikeText(buf: Uint8Array): boolean {
  const sample = buf.subarray(0, 8192);
  let bad = 0;
  for (const c of sample) if (c === 0 || (c < 9 && c !== 0)) bad++;
  if (bad > 0) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.length < buf.length ? buf.subarray(0, 8000) : buf);
    return true;
  } catch {
    return false;
  }
}

const CODE_EXT = new Set(["js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "swift", "php", "vue", "svelte", "css", "sql", "sh"]);
export const isCodeExtension = (ext: string | null) => !!ext && CODE_EXT.has(ext);
