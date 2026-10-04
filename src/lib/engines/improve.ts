import { SEVERITY_RANK, isFailing, isPassing } from "./taxonomy";

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
 * Build a targeted correction prompt from selected findings. Deterministic:
 * it restates findings the user selected, lists what already works so the
 * tool does not touch it, and asks for verification of each fix.
 */
export function buildCorrectionPrompt(input: {
  goal: string;
  targetTool: string;
  artifactLabel: string;
  selected: F[];
  passing: F[];
  extraInstruction?: string;
}): string {
  const lines: string[] = [];
  lines.push(
    `You are fixing an existing ${input.artifactLabel || "result"}. Make targeted changes only. Do not redesign, restyle or rewrite anything that is not listed below.`,
    "",
  );
  if (input.goal.trim()) lines.push("## Original goal", input.goal.trim(), "");

  lines.push("## Fix these issues (in this order)");
  input.selected.forEach((f, i) => {
    lines.push(`${i + 1}. ${f.title}${f.status === "likely_issue" ? " (reported by review, confirm before changing)" : ""}`);
    if (f.detail) lines.push(`   Problem: ${f.detail}`);
    if (f.evidence) lines.push(`   Evidence: ${f.evidence.split("\n").slice(0, 4).join("; ")}`);
    if (f.recommendation) lines.push(`   Desired result: ${f.recommendation}`);
    if (f.verification) lines.push(`   Verify by: ${f.verification}`);
  });
  lines.push("");

  const keep = input.passing.filter((p) => isPassing(p.status) && p.requirementId).slice(0, 12);
  if (keep.length) {
    lines.push("## Keep working (do not change or break these)");
    for (const p of keep) lines.push(`- ${p.title}`);
    lines.push("");
  }
  if (input.extraInstruction?.trim()) lines.push("## Additional instruction", input.extraInstruction.trim(), "");

  lines.push(
    "## Constraints",
    "- Change only what is needed for the issues above.",
    "- Preserve existing content, structure, styling and behaviour that is not mentioned.",
    "- If a fix would conflict with something in 'Keep working', stop and say so instead of choosing.",
    "",
    "## When done",
    "- For each numbered issue, state what you changed and how you verified it.",
    "- List any issue you could not fix and why.",
  );
  if (input.targetTool.trim()) lines.push("", `(For ${input.targetTool.trim()}.)`);
  return lines.join("\n");
}
