/**
 * Reads one string field out of JSON that is still being written, e.g.
 * `{"refined":"Build a por` gives "Build a por". Used only to show text as it
 * streams; the finished output is parsed and validated normally.
 */
export function partialStringField(raw: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw);
  if (!m) return null;
  let out = "";
  for (let i = m.index + m[0].length; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') return out;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) return out; // escape cut off mid-stream
    if (next === "u") {
      const hex = raw.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[next] ?? next;
    i += 1;
  }
  return out;
}
