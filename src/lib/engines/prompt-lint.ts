import type { PromptWeakness } from "@/lib/db/schema";

/**
 * Deterministic prompt checks. These are heuristics over the text, so every
 * weakness says what triggered it. They never claim the prompt is "good";
 * an empty result means only that none of these specific gaps were found.
 */

const VAGUE_TERMS = [
  "premium",
  "modern",
  "clean",
  "sleek",
  "nice",
  "beautiful",
  "professional",
  "interactive",
  "engaging",
  "awesome",
  "amazing",
  "stunning",
  "cool",
  "better",
  "good",
  "user-friendly",
  "intuitive",
  "minimal",
  "minimalist",
  "fancy",
  "polished",
  "high quality",
  "high-quality",
  "world-class",
  "best",
];

type Rule = {
  id: string;
  label: string;
  severity: PromptWeakness["severity"];
  test: (p: string, lower: string, ctx: LintContext) => { hit: boolean; detail?: string; excerpt?: string };
};

export type LintContext = { contentType?: string };

const has = (lower: string, words: (string | RegExp)[]) =>
  words.some((w) => (typeof w === "string" ? lower.includes(w) : w.test(lower)));

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

const VISUAL_TYPES = new Set(["website", "app", "design", "image"]);
const BUILD_TYPES = new Set(["website", "app", "code"]);

const RULES: Rule[] = [
  {
    id: "too_short",
    label: "Very little to go on",
    severity: "high",
    test: (p) => {
      const n = wordCount(p);
      return { hit: n > 0 && n < 12, detail: `The prompt is ${n} words. The model has to guess most decisions.` };
    },
  },
  {
    id: "vague_qualities",
    label: "Undefined quality words",
    severity: "medium",
    test: (_p, lower) => {
      const found = VAGUE_TERMS.filter((t) => new RegExp(`\\b${t.replace("-", "[- ]")}\\b`).test(lower));
      return {
        hit: found.length > 0,
        detail: `"${found.slice(0, 5).join('", "')}" ${found.length === 1 ? "means" : "mean"} different things to different models. Say what it looks or behaves like.`,
        excerpt: found.join(", "),
      };
    },
  },
  {
    id: "no_audience",
    label: "No audience",
    severity: "medium",
    test: (_p, lower) => ({
      hit: !has(lower, [/\b(audience|users?|customers?|visitors?|clients?|recruiters?|readers?|for (people|teams|developers|designers|students|businesses))\b/]),
      detail: "Nothing says who this is for, so tone, content and priorities are guessed.",
    }),
  },
  {
    id: "no_output_format",
    label: "Output format not specified",
    severity: "medium",
    test: (_p, lower, ctx) => ({
      hit: !has(lower, [
        /\b(format|return|output|respond with|deliver|as a (list|table|json|markdown)|json|markdown|html|tsx|jsx|react|next\.?js|svg|png|pdf|single file|component|sections?|pages?|bullet)\b/,
      ]),
      detail:
        ctx.contentType && BUILD_TYPES.has(ctx.contentType)
          ? "No stack, file structure or deliverable is named, so the tool picks one for you."
          : "The shape of the answer (length, structure, file type) is left open.",
    }),
  },
  {
    id: "no_constraints",
    label: "No constraints",
    severity: "low",
    test: (_p, lower) => ({
      hit: !has(lower, [/\b(must|should|only|at most|no more than|under|within|limit|max(imum)?|min(imum)?|exactly|required?)\b/]),
      detail: "No hard limits (length, stack, budget, brand rules), so nothing rules out a wrong answer.",
    }),
  },
  {
    id: "no_exclusions",
    label: "Nothing is ruled out",
    severity: "low",
    test: (_p, lower) => ({
      hit: !has(lower, [/\b(don'?t|do not|avoid|never|without|no (gradients?|animations?|emojis?|stock|placeholder|lorem))\b/]),
      detail: "Stating what to avoid is often the fastest way to stop generic output.",
    }),
  },
  {
    id: "no_success_criteria",
    label: "No way to tell if it worked",
    severity: "medium",
    test: (_p, lower) => ({
      hit: !has(lower, [/\b(success|acceptance|criteria|done when|so that|verify|test|check that|measur|goal is|in order to)\b/]),
      detail: "Without success criteria the model cannot check its own work and you cannot evaluate it consistently.",
    }),
  },
  {
    id: "no_responsive",
    label: "Screen sizes not mentioned",
    severity: "medium",
    test: (_p, lower, ctx) => ({
      hit: !!ctx.contentType && ["website", "app"].includes(ctx.contentType) && !has(lower, [/\b(mobile|responsive|tablet|desktop|breakpoint|viewport|screen sizes?)\b/]),
      detail: "Generated layouts often break on phones unless mobile behaviour is asked for explicitly.",
    }),
  },
  {
    id: "no_accessibility",
    label: "Accessibility not mentioned",
    severity: "low",
    test: (_p, lower, ctx) => ({
      hit: !!ctx.contentType && ["website", "app", "design"].includes(ctx.contentType) && !has(lower, [/\b(accessib|a11y|wcag|contrast|keyboard|screen reader|alt text|aria)\b/]),
      detail: "Contrast, keyboard use and alt text are rarely handled unless requested.",
    }),
  },
  {
    id: "no_visual_reference",
    label: "No visual reference",
    severity: "low",
    test: (_p, lower, ctx) => ({
      hit:
        !!ctx.contentType &&
        VISUAL_TYPES.has(ctx.contentType) &&
        !has(lower, [/\b(like|similar to|inspired by|reference|colou?rs?|palette|font|typeface|typography|#[0-9a-f]{3,6}|dark|light|style)\b/]),
      detail: "No colours, type, references or style anchors. The tool will fall back to its defaults.",
    }),
  },
  {
    id: "stacked_asks",
    label: "Many unrelated asks in one go",
    severity: "low",
    test: (p) => {
      const asks = p.split(/(?:\band\b|,|;|\n|\.)/i).filter((s) => /\b(add|make|create|build|include|design|write|generate|fix|change)\b/i.test(s));
      return {
        hit: asks.length >= 6,
        detail: `About ${asks.length} separate instructions. Consider splitting into steps or ordering them by priority.`,
      };
    },
  },
  {
    id: "conflicting_density",
    label: "Possible contradiction",
    severity: "medium",
    test: (_p, lower) => {
      const minimal = /\b(minimal|minimalist|simple|clean|sparse)\b/.test(lower);
      const dense = /\b(lots of|many|tons of|packed|rich|detailed|every|all the)\b/.test(lower);
      return {
        hit: minimal && dense,
        detail: "It asks for something minimal and for a lot of content or features. Say which wins when they conflict.",
      };
    },
  },
];

export function lintPrompt(prompt: string, ctx: LintContext = {}): PromptWeakness[] {
  const text = prompt.trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  const out: PromptWeakness[] = [];
  for (const rule of RULES) {
    const r = rule.test(text, lower, ctx);
    if (r.hit) out.push({ id: rule.id, label: rule.label, severity: rule.severity, detail: r.detail ?? "", excerpt: r.excerpt, source: "deterministic" });
  }
  const order = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export const LINT_RULE_IDS = RULES.map((r) => r.id);
export const LINT_LABELS: Record<string, string> = Object.fromEntries(RULES.map((r) => [r.id, r.label]));
