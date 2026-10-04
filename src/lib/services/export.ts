import "server-only";
import type { Workspace } from "@/lib/repo/projects";
import { STATUS_LABEL, type FindingStatus } from "@/lib/engines/taxonomy";

/** Plain Markdown export of a project's evidence and decisions. */
export function projectMarkdown(ws: Workspace): string {
  const { project, requirements, prompts, artifacts, evaluations, findings } = ws;
  const out: string[] = [`# ${project.name}`, "", `Exported ${new Date().toISOString()} from UPSHIFT AI.`, ""];
  if (project.goal) out.push("## Goal", project.goal, "");
  const b = project.brief;
  const briefLines = [
    ["Audience", b.audience],
    ["Objective", b.objective],
    ["Visual direction", b.visualDirection],
    ["Technical constraints", b.technicalConstraints],
    ["Exclusions", b.exclusions],
  ].filter(([, v]) => v);
  if (briefLines.length) {
    out.push("## Brief");
    for (const [k, v] of briefLines) out.push(`- **${k}:** ${v}`);
    out.push("");
  }
  const confirmed = requirements.filter((r) => r.status === "confirmed");
  if (confirmed.length) {
    out.push("## Requirements");
    for (const r of confirmed) out.push(`- [${r.priority}] (${r.category}) ${r.text}${r.acceptance ? `\n  - Check: ${r.acceptance}` : ""}`);
    out.push("");
  }
  const latestByKind = (kind: string) => prompts.find((p) => p.kind === kind);
  for (const [kind, title] of [
    ["original", "Original prompt"],
    ["optimized", "Improved prompt"],
    ["refined", "Latest refined prompt"],
    ["correction", "Latest correction prompt"],
  ] as const) {
    const p = latestByKind(kind);
    if (p) out.push(`## ${title}`, "", "```text", p.content, "```", "");
  }
  for (const a of artifacts) {
    const ev = evaluations.find((e) => e.artifactId === a.id && e.status === "complete");
    out.push(`## Version ${a.version}: ${a.label}`, a.sourceUrl ? `URL: ${a.sourceUrl}` : "", a.note ? `Note: ${a.note}` : "");
    if (!ev) {
      out.push("_Not evaluated._", "");
      continue;
    }
    for (const f of findings.filter((x) => x.evaluationId === ev.id)) {
      out.push(`- **${STATUS_LABEL[f.status as FindingStatus] ?? f.status}** [${f.method}, ${f.severity}] ${f.title}${f.detail ? `: ${f.detail}` : ""}`);
      if (f.recommendation) out.push(`  - Fix: ${f.recommendation}`);
    }
    out.push("");
  }
  return out.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}
