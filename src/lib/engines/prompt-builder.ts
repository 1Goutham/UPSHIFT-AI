import { z } from "zod";
import type { Requirement } from "@/lib/db/schema";

/**
 * Prompt Intelligence: shapes shared by the model path and the deterministic
 * assembler, plus the assembler itself.
 */

export const OptimizedPromptSchema = z.object({
  weaknesses: z
    .array(z.object({ label: z.string(), detail: z.string(), severity: z.enum(["high", "medium", "low"]) }))
    .describe("Weaknesses in the ORIGINAL prompt that matter for this task. Do not pad."),
  improved: z.string().describe("The improved prompt, ready to paste into the target tool."),
  concise: z.string().describe("A shorter version keeping every must-have requirement."),
  detailed: z.string().describe("A fuller version with validation instructions and edge cases."),
  changes: z.array(z.object({ change: z.string(), reason: z.string() })).describe("The important changes and why. 3-8 items."),
  preserved: z.array(z.string()).describe("Decisions/wording from the original that were deliberately kept."),
  assumptions: z.array(z.string()).describe("Anything you assumed that the user should confirm."),
  toolNotes: z
    .array(z.string())
    .describe("Advice specific to the named target tool. Empty if no tool named or you are not confident about that tool's behaviour."),
});
export type OptimizedPrompt = z.infer<typeof OptimizedPromptSchema>;

export const RefinedPromptSchema = z.object({
  improved: z.string(),
  changes: z.array(z.object({ change: z.string(), reason: z.string() })),
});

const CATEGORY_HEADINGS: Record<string, string> = {
  objective: "Objective",
  audience: "Audience",
  content: "Content and sections",
  functionality: "Functionality",
  visual: "Visual direction",
  responsive: "Responsive behaviour",
  accessibility: "Accessibility",
  performance: "Performance",
  technical: "Technical constraints",
  other: "Other requirements",
};

type Req = Pick<Requirement, "category" | "text" | "acceptance" | "priority">;

/**
 * Assemble a structured prompt from the user's confirmed requirements. No
 * model involved: this reorganises what the user already decided and keeps
 * the original prompt verbatim at the top as context.
 */
export function assemblePrompt(input: {
  goal: string;
  original: string;
  targetTool: string;
  requirements: Req[];
  answers?: { question: string; answer: string }[];
  variant?: "standard" | "concise";
}): string {
  const reqs = input.requirements;
  const exclusions = reqs.filter((r) => r.category === "exclusion");
  const rest = reqs.filter((r) => r.category !== "exclusion");
  const lines: string[] = [];

  if (input.goal.trim()) lines.push("## Goal", input.goal.trim(), "");
  if (input.variant !== "concise" && input.original.trim() && input.original.trim() !== input.goal.trim()) {
    lines.push("## Original request (keep its intent)", input.original.trim(), "");
  }
  const answered = (input.answers ?? []).filter((a) => a.answer.trim());
  if (answered.length) {
    lines.push("## Context");
    for (const a of answered) lines.push(`- ${a.question} ${a.answer.trim()}`);
    lines.push("");
  }

  const byCat = new Map<string, Req[]>();
  for (const r of rest) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  const order = Object.keys(CATEGORY_HEADINGS);
  const cats = [...byCat.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (cats.length) {
    lines.push("## Requirements");
    for (const cat of cats) {
      const items = byCat.get(cat)!.filter((r) => input.variant !== "concise" || r.priority !== "could");
      if (!items.length) continue;
      lines.push(`### ${CATEGORY_HEADINGS[cat] ?? cat}`);
      for (const r of items) lines.push(`- ${r.priority === "must" ? "[MUST] " : r.priority === "could" ? "[NICE TO HAVE] " : ""}${r.text}`);
    }
    lines.push("");
  }
  if (exclusions.length) {
    lines.push("## Do not");
    for (const r of exclusions) lines.push(`- ${r.text.replace(/^(don'?t|do not)\s+/i, "")}`);
    lines.push("");
  }

  const checks = reqs.filter((r) => r.acceptance.trim());
  if (checks.length && input.variant !== "concise") {
    lines.push("## Done when");
    for (const r of checks) lines.push(`- ${r.acceptance.trim()}`);
    lines.push("");
  }
  lines.push(
    "## Before you finish",
    "- Check the result against every [MUST] item above and say which ones you could not satisfy.",
    "- Ask instead of guessing if a requirement conflicts with another.",
  );
  if (input.targetTool.trim()) lines.push("", `(Written for ${input.targetTool.trim()}.)`);
  return lines.join("\n").trim();
}
