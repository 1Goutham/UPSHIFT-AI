import { findPlaceholders } from "./html-checks";
import type { FindingDraft } from "./types";

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/\bsk-(?:proj-)?[A-Za-z0-9]{20,}/, "OpenAI-style secret key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "Private key"],
  [/\b(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s:]+:[^\s@]+@/, "Database URL with password"],
];

const mask = (s: string) => (s.length <= 10 ? "****" : `${s.slice(0, 6)}…${s.slice(-2)}`);

/** Deterministic checks for pasted or uploaded text and code. */
export function runTextChecks(text: string, kind: "text" | "code"): FindingDraft[] {
  const out: FindingDraft[] = [];
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text.split("\n").length;

  out.push({
    checkKey: "check:size",
    title: kind === "code" ? "Code size" : "Length",
    detail: kind === "code" ? `${lines} lines.` : `${words} words, ${lines} lines.`,
    status: "verified_pass",
    severity: "info",
    method: "deterministic",
    category: "other",
  });

  const placeholders = findPlaceholders(text);
  out.push({
    checkKey: "check:placeholder_content",
    title: "No placeholder content",
    detail: placeholders.length ? `${placeholders.length} kind(s) of placeholder text found.` : "No common placeholder patterns found.",
    status: placeholders.length ? "verified_fail" : "verified_pass",
    severity: placeholders.length ? (kind === "code" ? "low" : "high") : "info",
    evidence: placeholders.slice(0, 5).join("\n"),
    recommendation: placeholders.length ? "Replace or remove the placeholders before using this output." : "",
    verification: "Search the text for the listed snippets.",
    method: "deterministic",
    category: "content",
  });

  const secrets: string[] = [];
  for (const [re, label] of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) secrets.push(`${label}: ${mask(m[0])} (line ${text.slice(0, m.index).split("\n").length})`);
  }
  out.push({
    checkKey: "check:secrets",
    title: "No hard-coded secrets",
    detail: secrets.length
      ? `${secrets.length} likely credential(s) found. Anyone with this file can use them.`
      : "No common credential formats found. This does not prove the absence of secrets.",
    status: secrets.length ? "verified_fail" : "verified_pass",
    severity: secrets.length ? "critical" : "info",
    evidence: secrets.join("\n"),
    recommendation: secrets.length ? "Revoke the exposed credentials, move them to server-side environment variables, and remove them from history." : "",
    verification: "Run a secret scanner (e.g. gitleaks) over the project.",
    method: "deterministic",
    category: "technical",
  });

  if (kind === "code") {
    const todo = (text.match(/\b(TODO|FIXME|XXX|HACK)\b/g) ?? []).length;
    const logs = (text.match(/\bconsole\.(log|debug)\(/g) ?? []).length;
    const anyTs = (text.match(/:\s*any\b/g) ?? []).length;
    out.push({
      checkKey: "check:code_hygiene",
      title: "Leftover debug and TODO markers",
      detail: `${todo} TODO/FIXME marker(s), ${logs} console.log/debug call(s)${anyTs ? `, ${anyTs} explicit any type(s)` : ""}.`,
      status: todo + logs > 0 ? "subjective" : "verified_pass",
      severity: todo + logs > 5 ? "low" : "info",
      recommendation: todo + logs > 0 ? "Resolve TODOs that block the requirements and remove debug logging before shipping." : "",
      verification: "Search for TODO and console.log.",
      method: "deterministic",
      category: "technical",
    });
  }
  return out;
}

export function runImageChecks(meta: { width?: number; height?: number; format?: string }, sizeBytes: number): FindingDraft[] {
  const { width, height, format } = meta;
  const out: FindingDraft[] = [];
  out.push({
    checkKey: "check:image_basics",
    title: "Image file",
    detail: width && height ? `${width}×${height}px ${format?.toUpperCase() ?? ""}, ${(sizeBytes / 1024).toFixed(0)} KB.` : "Dimensions could not be read.",
    status: width && height ? "verified_pass" : "unable_to_verify",
    severity: "info",
    method: "deterministic",
    category: "technical",
  });
  if (width && height && Math.min(width, height) < 600)
    out.push({
      checkKey: "check:image_resolution",
      title: "Low resolution",
      detail: `The shorter side is ${Math.min(width, height)}px. Visual details (small text, fine lines) are hard to judge reliably at this size.`,
      status: "subjective",
      severity: "low",
      recommendation: "Upload a larger export or a full-resolution screenshot for a more reliable review.",
      method: "deterministic",
      category: "technical",
    });
  return out;
}
