import { z } from "zod";
import { lintPrompt } from "./prompt-lint";
import { CATEGORIES, PRIORITIES, type Category, type ContentType, type Priority } from "./taxonomy";

/**
 * Intent engine: goal + original prompt -> structured brief + requirement
 * candidates. Two implementations share one output shape:
 *
 *  - `deterministicBrief` splits the user's own words into candidate
 *    requirements and adds a small, clearly labelled baseline for the content
 *    type. It never invents audience, style or features.
 *  - The model path (see services/intent.ts) can infer, but must label each
 *    requirement explicit / inferred / assumption.
 *
 * All candidates are stored as "proposed" until the user confirms them.
 */

export const BriefSchema = z.object({
  summary: z.string().describe("One or two sentences: what the user is actually trying to achieve."),
  taskType: z.string().describe("Short task type, e.g. 'portfolio website', 'landing page', 'product illustration'."),
  audience: z.string().describe("Intended audience. Empty string if unknown."),
  objective: z.string().describe("Primary objective/outcome."),
  visualDirection: z.string().describe("Visual direction stated or reasonably implied. Empty if not applicable."),
  technicalConstraints: z.string().describe("Stack, platform, performance or other technical constraints. Empty if none."),
  exclusions: z.string().describe("Things explicitly not wanted. Empty if none."),
  requirements: z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        text: z.string().describe("The requirement, one testable statement."),
        acceptance: z.string().describe("How someone would check it is met (observable, specific)."),
        priority: z.enum(PRIORITIES),
        origin: z.enum(["explicit", "inferred", "assumption"]),
      }),
    )
    .describe("8-16 requirements. Explicit ones first."),
  ambiguities: z.array(z.object({ issue: z.string(), why: z.string() })).describe("Contradictions or unclear points. Max 4."),
  questions: z
    .array(z.object({ question: z.string(), why: z.string() }))
    .describe("At most 3 high-impact clarifying questions; only ones whose answer would change the output."),
  assumptions: z.array(z.string()).describe("Reasonable assumptions you made instead of asking."),
});
export type BriefDraft = z.infer<typeof BriefSchema>;

export type RequirementCandidate = {
  category: Category;
  text: string;
  acceptance: string;
  priority: Priority;
  origin: "explicit" | "inferred" | "assumption" | "baseline";
};

const CATEGORY_HINTS: [Category, RegExp][] = [
  ["exclusion", /\b(don'?t|do not|avoid|never|without|no )\b/i],
  ["responsive", /\b(mobile|responsive|tablet|breakpoint|viewport)\b/i],
  ["accessibility", /\b(accessib|a11y|wcag|contrast|keyboard|screen reader|alt text)\b/i],
  ["performance", /\b(fast|performance|load(ing)? time|lighthouse|lightweight|speed)\b/i],
  ["audience", /\b(audience|recruiters?|customers?|users?|visitors?|clients?)\b/i],
  ["visual", /\b(colou?r|font|typography|dark|light|style|look|premium|modern|minimal|animation|motion|layout|visual|aesthetic)\b/i],
  ["functionality", /\b(form|button|login|search|filter|navigation|nav|menu|interactive|click|submit|upload|chat|cart|checkout)\b/i],
  ["technical", /\b(react|next|tailwind|typescript|vue|svelte|api|database|deploy|vercel|html|css|seo)\b/i],
  ["content", /\b(section|page|about|projects?|contact|hero|testimonials?|pricing|faq|blog|copy|text)\b/i],
];

function categorise(s: string): Category {
  for (const [cat, re] of CATEGORY_HINTS) if (re.test(s)) return cat;
  return "other";
}

/** Split free text into clause-sized statements worth tracking. */
export function splitClauses(text: string): string[] {
  return text
    .split(/(?:\r?\n|(?<=[.!?;])\s+|\s+-\s+|•)/)
    .flatMap((s) => (s.length > 140 ? s.split(/,\s+(?=(?:and |with |plus |also )?[a-z])/i) : [s]))
    .map((s) => s.replace(/^[\s\-*\d.)]+/, "").replace(/\s+/g, " ").trim().replace(/[.;]$/, ""))
    .filter((s) => s.split(" ").length >= 3 && s.length <= 300);
}

const BASELINE: Partial<Record<ContentType, RequirementCandidate[]>> = {
  website: [
    {
      category: "responsive",
      text: "Layout works on phone and desktop widths without horizontal scrolling",
      acceptance: "At 390px and 1440px wide the page has no horizontal overflow and text stays readable.",
      priority: "must",
      origin: "baseline",
    },
    {
      category: "accessibility",
      text: "Images have alt text and the page declares a language",
      acceptance: "Every <img> has an alt attribute; <html> has a lang attribute.",
      priority: "should",
      origin: "baseline",
    },
    {
      category: "technical",
      text: "Page has a descriptive title and a mobile viewport tag",
      acceptance: "<title> is present and non-empty; <meta name=viewport> is set.",
      priority: "should",
      origin: "baseline",
    },
    {
      category: "technical",
      text: "No JavaScript errors on load",
      acceptance: "Browser console shows no uncaught errors when the page loads.",
      priority: "must",
      origin: "baseline",
    },
  ],
  design: [
    {
      category: "accessibility",
      text: "Text has sufficient contrast against its background",
      acceptance: "Body text meets WCAG AA contrast (4.5:1).",
      priority: "should",
      origin: "baseline",
    },
  ],
};
BASELINE.app = BASELINE.website;

/** Questions derived from gaps the prompt checks found. */
const GAP_QUESTIONS: Record<string, { question: string; why: string }> = {
  no_audience: { question: "Who is this for, and what should they do or feel after seeing it?", why: "Audience decides tone, content priority and what 'good' means." },
  vague_qualities: {
    question: "Can you point to one or two references (sites, images, brands) that look the way you mean?",
    why: "Words like 'premium' or 'modern' are read very differently by different tools.",
  },
  no_success_criteria: { question: "What would make you say this result is done?", why: "Gives the audit something concrete to check against." },
  no_output_format: { question: "Which tool, stack or file format should the result be delivered in?", why: "Changes the structure of the instructions and how output is checked." },
};

export function deterministicBrief(input: { goal: string; prompt: string; contentType: ContentType }) {
  const source = [input.goal, input.prompt].filter(Boolean).join("\n");
  const explicit: RequirementCandidate[] = [];
  // Goal and prompt often repeat each other; keep the fuller wording once.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const clauses = [...new Set(splitClauses(source))].sort((a, b) => b.length - a.length);
  const kept: string[] = [];
  for (const c of clauses) if (!kept.some((k) => norm(k).includes(norm(c)))) kept.push(c);
  const order = splitClauses(source);
  kept.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const clause of kept) {
    const category = categorise(clause);
    explicit.push({
      category,
      text: clause.charAt(0).toUpperCase() + clause.slice(1),
      acceptance: "",
      priority: category === "exclusion" ? "must" : "should",
      origin: "explicit",
    });
  }

  const gaps = lintPrompt(source, { contentType: input.contentType });
  const questions = gaps
    .map((g) => GAP_QUESTIONS[g.id])
    .filter(Boolean)
    .slice(0, 3)
    .map((q, i) => ({ id: `q${i + 1}`, ...q }));

  return {
    brief: {
      summary: input.goal.trim(),
      method: "deterministic",
      questions,
      ambiguities: gaps.filter((g) => g.id === "conflicting_density").map((g) => ({ issue: g.label, why: g.detail })),
      assumptions: [],
    },
    requirements: [...explicit.slice(0, 20), ...(BASELINE[input.contentType] ?? [])],
  };
}
