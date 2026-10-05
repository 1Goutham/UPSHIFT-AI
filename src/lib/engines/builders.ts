/**
 * How correction prompts are shaped per AI builder. These are UPSHIFT's
 * conventions (smaller batches for chat builders, explicit self-checks for
 * coding agents), not vendor documentation.
 */
export type BuilderProfile = { id: string; label: string; kind: "chat" | "agent" | "generic"; batch: number };

export const BUILDERS: BuilderProfile[] = [
  { id: "lovable", label: "Lovable", kind: "chat", batch: 4 },
  { id: "v0", label: "v0", kind: "chat", batch: 4 },
  { id: "bolt", label: "Bolt", kind: "chat", batch: 4 },
  { id: "replit", label: "Replit", kind: "chat", batch: 4 },
  { id: "cursor", label: "Cursor", kind: "agent", batch: 10 },
  { id: "claude-code", label: "Claude Code", kind: "agent", batch: 10 },
  { id: "windsurf", label: "Windsurf", kind: "agent", batch: 10 },
  { id: "copilot", label: "GitHub Copilot", kind: "agent", batch: 10 },
];

const GENERIC: BuilderProfile = { id: "other", label: "", kind: "generic", batch: 6 };

export function builderFor(targetTool: string): BuilderProfile {
  const t = targetTool.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return GENERIC;
  return BUILDERS.find((b) => t.includes(b.id.replace("-", "")) || t.includes(b.label.toLowerCase().replace(/\s+/g, ""))) ?? { ...GENERIC, label: targetTool.trim() };
}
