import { SEVERITY_RANK, isFailing, isPassing } from "./taxonomy";
import { builderFor } from "./builders";

type F = {
  id: string;
  title: string;
  detail: string;
  status: string;
  severity: string;
  evidence: string;
  recommendation: string;
  verification: string;
  method: string;
  category: string;
  requirementId: string | null;
};

/**
 * Checks that were folded into a failing requirement finding (its evidence
 * lists them as "FAIL: <title>"). Selecting both would repeat the same fix.
 */
export function redundantCheckIds<T extends Pick<F, "id" | "title" | "evidence" | "status" | "requirementId" | "method">>(findings: T[]): Set<string> {
  const folded = new Set<string>();
  for (const f of findings)
    if (f.requirementId && f.method !== "model" && f.method !== "human" && f.status === "verified_fail")
      for (const line of f.evidence.split("\n")) if (line.startsWith("FAIL: ")) folded.add(line.slice(6).split(":")[0].trim());
  return new Set(findings.filter((f) => !f.requirementId && folded.has(f.title)).map((f) => f.id));
}

const PRIORITY_RANK: Record<string, number> = { must: 0, should: 1, could: 2 };

/**
 * Order issues for fixing: severity first, then requirement priority, then
 * verified before model-judged (fix what is proven first), then foundational
 * categories (technical/responsive) before cosmetic ones because later fixes
 * depend on them.
 */
export function prioritise<T extends F>(findings: T[], priorities: Map<string, string>): T[] {
  const catRank: Record<string, number> = { technical: 0, functionality: 1, responsive: 2, content: 3, accessibility: 4, performance: 5, visual: 6 };
  return findings
    .filter((f) => isFailing(f.status))
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        (PRIORITY_RANK[priorities.get(a.requirementId ?? "") ?? "should"] ?? 1) - (PRIORITY_RANK[priorities.get(b.requirementId ?? "") ?? "should"] ?? 1) ||
        Number(a.status !== "verified_fail") - Number(b.status !== "verified_fail") ||
        (catRank[a.category] ?? 9) - (catRank[b.category] ?? 9),
    );
}

/**
 * Build targeted correction prompts from selected findings. Deterministic:
 * restates the selected findings, lists what already works so it is kept,
 * and asks for verification. Large sets are split into several messages for
 * chat builders, which tend to regress when asked for many fixes at once.
 */
export function buildCorrectionPrompts(input: {
  goal: string;
  targetTool: string;
  artifactLabel: string;
  selected: F[];
  passing: F[];
  extraInstruction?: string;
}): string[] {
  const builder = builderFor(input.targetTool);
  const batches: F[][] = [];
  for (let i = 0; i < input.selected.length; i += builder.batch) batches.push(input.selected.slice(i, i + builder.batch));
  const keep = input.passing.filter((p) => isPassing(p.status) && p.requirementId).slice(0, 12);

  return batches.map((batch, b) => {
    const part = batches.length > 1 ? ` (message ${b + 1} of ${batches.length})` : "";
    const lines: string[] = [];
    if (b === 0) {
      lines.push(`Fix the issues below in the existing ${input.artifactLabel || "result"}${part}. Make targeted changes only. Do not redesign, restyle or rewrite anything that is not listed.`, "");
      if (input.goal.trim()) lines.push("## Goal", input.goal.trim(), "");
    } else {
      lines.push(`Continue${part}. Keep the fixes from the previous message. Change only what is listed below.`, "");
    }
    lines.push(builder.kind === "agent" ? "## Task" : "## Fix these, in order");
    batch.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.title}${f.status === "likely_issue" ? " (reported by review: confirm before changing)" : ""}`);
      if (f.detail) lines.push(`   Problem: ${f.detail}`);
      if (f.evidence) lines.push(`   Evidence: ${f.evidence.split("\n").slice(0, 3).join("; ")}`);
      if (f.recommendation) lines.push(`   Desired result: ${f.recommendation}`);
      if (f.verification && builder.kind !== "chat") lines.push(`   Verify: ${f.verification}`);
    });
    lines.push("");
    if (keep.length && b === 0) {
      lines.push("## Keep working (do not change or break)");
      for (const p of keep) lines.push(`- ${p.title}`);
      lines.push("");
    }
    if (input.extraInstruction?.trim() && b === 0) lines.push("## Also", input.extraInstruction.trim(), "");
    if (builder.kind === "agent") {
      lines.push(
        "## Before you finish",
        "- Run the app and check every item above at 390px and 1440px wide.",
        "- Run the existing tests and linters; do not change unrelated files.",
        "- Reply with what you changed for each item and anything you could not fix.",
      );
    } else {
      lines.push("When done, say what you changed for each item and anything you could not fix.");
    }
    return lines.join("\n");
  });
}

/** Single-message form, kept for callers that need one string. */
export function buildCorrectionPrompt(input: Parameters<typeof buildCorrectionPrompts>[0]): string {
  return buildCorrectionPrompts({ ...input, targetTool: input.targetTool || "" }).join("\n\n");
}

/** How a fix prompt played out in the next version, matched by check key. */
export function fixOutcome(attemptedKeys: string[], next: { checkKey: string; status: string }[]) {
  const byKey = new Map(next.map((f) => [f.checkKey, f.status]));
  let resolved = 0;
  let stillFailing = 0;
  for (const k of attemptedKeys) {
    const st = byKey.get(k);
    if (st && isPassing(st)) resolved++;
    else if (st && isFailing(st)) stillFailing++;
  }
  return { attempted: attemptedKeys.length, resolved, stillFailing };
}
