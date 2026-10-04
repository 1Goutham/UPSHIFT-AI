"use client";

import { Empty } from "../ui";
import { fmtTime, type Ctx } from "./types";

const LABEL: Record<string, (d: Record<string, unknown>) => string> = {
  "project.created": (d) => `Project created${d.playbook ? ` from playbook "${d.playbook}"` : ""}`,
  "project.updated": (d) => `Updated ${(d.fields as string[] | undefined)?.join(", ") ?? "project"}`,
  "project.exported": () => "Exported as Markdown",
  "brief.generated": (d) => `Brief built (${String(d.method).startsWith("model") ? "model" : "from your words"}), ${d.candidates} suggestions`,
  "requirement.added": (d) => `Added requirement: ${d.text}`,
  "requirement.updated": (d) => (d.status ? `Requirement ${d.status}` : "Requirement edited"),
  "requirement.deleted": (d) => `Deleted requirement: ${d.text}`,
  "requirements.confirmed_all": (d) => `Accepted ${d.count} suggested requirements`,
  "prompt.original_saved": (d) => `Saved original prompt (${d.weaknesses} gaps found)`,
  "prompt.optimized": (d) => `Improved prompt (${d.method === "model" ? "model rewrite" : "structured from brief"})`,
  "prompt.refined": () => "Refined prompt with a follow-up instruction",
  "prompt.edited": () => "Edited a prompt (saved as new version)",
  "artifact.added": (d) => `Added output v${d.version} (${d.kind})`,
  "evaluation.started": (d) => `Audit started for v${d.version}`,
  "evaluation.completed": (d) => `Audit finished for v${d.version}${d.failing !== undefined ? `: ${d.failing} failing requirement(s)` : ""}`,
  "evaluation.failed": (d) => `Audit failed: ${d.error}`,
  "finding.reviewed": (d) => `You marked a finding as ${d.verdict === "verified_pass" ? "met" : "not met"} (was ${String(d.previous).replace("_", " ")})`,
  "correction.created": (d) => `Correction prompt for ${d.issues} issue(s) in v${d.version}`,
  "playbook.saved": (d) => `Saved as playbook (${d.requirements} requirements)`,
};

export function HistoryTab({ ctx }: { ctx: Ctx }) {
  const events = ctx.ws.events;
  if (!events.length) return <Empty title="No history yet" />;
  return (
    <div className="rise-in mx-auto max-w-3xl">
      <ol className="relative border-l border-line pl-5">
        {events.map((e) => (
          <li key={e.id} className="relative pb-5">
            <span className={`absolute -left-[23.5px] top-1.5 h-2 w-2 rounded-full ${e.type.includes("failed") ? "bg-fail" : e.type.startsWith("evaluation") || e.type.startsWith("correction") ? "bg-accent" : "bg-ink-3"}`} aria-hidden />
            <p className="text-sm text-ink">{(LABEL[e.type] ?? (() => e.type))(e.detail)}</p>
            <p className="font-mono text-[11px] text-ink-3">{fmtTime(e.createdAt)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-ink-3">Showing the latest {events.length} events. Earlier versions of prompts and outputs are never overwritten.</p>
    </div>
  );
}
