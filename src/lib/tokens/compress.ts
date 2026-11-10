import { keyTerms } from "../refine/intent-check";
import { estimateTokens } from "./estimate";

/**
 * Token reduction without losing meaning. Pure and deterministic, so it runs
 * instantly in the extension and on the web with no network.
 *
 * What it removes is limited to things that carry no instruction: greetings,
 * politeness, "could you please" wrappers, sign-offs, empty filler words,
 * wordy phrases with exact short equivalents, repeated sentences and extra
 * whitespace. Code, URLs, quotes, numbers and {{placeholders}} are set aside
 * first and never touched. Every result is checked by `checkPreserved`.
 */

export type PreserveIssue = { kind: "number" | "url" | "code" | "quote" | "placeholder" | "term" | "negation"; value: string };
export type PreserveCheck = { ok: boolean; issues: PreserveIssue[] };
export type Compression = {
  text: string;
  before: number;
  after: number;
  /** Tokens removed (never negative: a longer result is replaced by the original). */
  saved: number;
  /** saved / before, 0..1 */
  ratio: number;
  edits: { kind: Edit; count: number }[];
  check: PreserveCheck;
};
type Edit = "greeting" | "politeness" | "filler" | "wordy" | "duplicate" | "whitespace";

/* ---------------------------- protected spans ---------------------------- */

const PROTECT = [
  /```[\s\S]*?```/g, // fenced code
  /`[^`\n]+`/g, // inline code
  /\{\{[^}]+\}\}/g, // placeholders
  /\bhttps?:\/\/[^\s<>"')\]]+/gi, // URLs
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, // emails
  /"[^"\n]{1,400}"|“[^”\n]{1,400}”|‘[^’\n]{1,400}’/g, // quoted text
  /(?<=^|[\s:(])'[^'\n]{12,400}'(?=[\s.,;:!?)]|$)/g, // single-quoted passages (not apostrophes)
];

function protect(text: string) {
  const kept: string[] = [];
  // Material the prompt is *about* ("Translate this:\n<text>", "Here is my draft:\n...") is content, not
  // instruction: everything after a line ending in a colon is left exactly as written.
  const payload = /:[ \t]*\n/.exec(text);
  let out = payload ? text.slice(0, payload.index + payload[0].length) : text;
  const tail = payload ? text.slice(payload.index + payload[0].length) : "";
  if (tail) {
    kept.push(tail);
    out += `\u0000${kept.length - 1}\u0000`;
  }
  for (const re of PROTECT) {
    out = out.replace(re, (m) => {
      kept.push(m);
      return `\u0000${kept.length - 1}\u0000`;
    });
  }
  return { out, restore: (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]) };
}

/* --------------------------------- rules --------------------------------- */

type Rule = { kind: Edit; re: RegExp; to: string };

// Sentence-start request wrappers: "Could you please write X" means "Write X".
const S = String.raw`(^|[.!?]\s+|\n\s*)`;
const RULES: Rule[] = [
  { kind: "greeting", re: new RegExp(S + String.raw`(hi|hello|hey|dear \w+)( there| team| all| everyone)?[,!.]*\s+`, "gi"), to: "$1" },
  { kind: "greeting", re: new RegExp(S + String.raw`i hope (you('| a)re|this finds you) (doing )?(well|great|good)[^.!?\n]*[.!]\s*`, "gi"), to: "$1" },
  { kind: "politeness", re: new RegExp(S + String.raw`i (would|'d) (really |greatly )?appreciate (it )?if you (could|would|can) `, "gi"), to: "$1" },
  { kind: "politeness", re: new RegExp(S + String.raw`(could|can|would|will) you (please |kindly )?`, "gi"), to: "$1" },
  { kind: "politeness", re: new RegExp(S + String.raw`i (would like|want|need|'d like) you to `, "gi"), to: "$1" },
  { kind: "politeness", re: new RegExp(S + String.raw`(please|kindly) `, "gi"), to: "$1" },
  // Mid-sentence "please" can be a verb ("to please customers"): only drop it at a sentence end.
  { kind: "politeness", re: /,? please(?=[.!?]|$)/gim, to: "" },
  { kind: "politeness", re: /(^|[.!?]\s+|\n\s*)(thanks|thank you)( (so|very) much| in advance| a lot)?[.!]*\s*(?=$|\n)/gi, to: "$1" },
  { kind: "politeness", re: /(^|[.!?]\s+|\n\s*)(cheers|best regards|regards|best)[,.!]*\s*(?=$)/gi, to: "$1" },
  { kind: "filler", re: /\b(basically|actually|literally|honestly|essentially) /gi, to: "" },
  { kind: "filler", re: /\b(it is important to note that|it should be noted that|please note that|note that) /gi, to: "" },
  { kind: "wordy", re: /\bin order to\b/gi, to: "to" },
  { kind: "wordy", re: /\bdue to the fact that\b/gi, to: "because" },
  { kind: "wordy", re: /\bin spite of the fact that\b/gi, to: "although" },
  { kind: "wordy", re: /\bat this point in time\b/gi, to: "now" },
  { kind: "wordy", re: /\bin the event that\b/gi, to: "if" },
  { kind: "wordy", re: /\bfor the purpose of\b/gi, to: "for" },
  { kind: "wordy", re: /\b(with regards? to|in regards? to)\b/gi, to: "about" },
  { kind: "wordy", re: /\bprior to\b/gi, to: "before" },
  { kind: "wordy", re: /\b(is|are) able to\b/gi, to: "can" },
  { kind: "wordy", re: /\bha(s|ve) the ability to\b/gi, to: "can" },
  { kind: "wordy", re: /\ba (large|great) number of\b/gi, to: "many" },
  { kind: "wordy", re: /\bmake sure (that|to) /gi, to: "ensure " },
];

function tidy(s: string) {
  return s
    // Collapse runs of spaces inside lines, but keep leading indentation (nested lists).
    .replace(/(\S)[ \t]{2,}/g, "$1 ")
    .replace(/(\S) +([,.;:!?])/g, "$1$2")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[,;:]\s*/gm, "")
    .trim();
}

/** Capitalise sentence starts that a removal exposed ("could you write" left "write"). */
function capitalise(s: string) {
  return s.replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

function dedupeSentences(s: string): { text: string; removed: number } {
  const seen = new Set<string>();
  let removed = 0;
  const lines = s.split("\n").map((line) => {
    const parts = line.match(/[^.!?]+[.!?]*\s*/g) ?? [line];
    return parts
      .filter((p) => {
        const key = p.toLowerCase().replace(/[^\p{L}\p{N}\u0000]+/gu, " ").trim();
        if (key.length < 20) return true;
        if (seen.has(key)) {
          removed++;
          return false;
        }
        seen.add(key);
        return true;
      })
      .join("");
  });
  return { text: lines.join("\n"), removed };
}

export function compressLocal(text: string): Compression {
  const before = estimateTokens(text);
  if (!text.trim()) return { text, before, after: before, saved: 0, ratio: 0, edits: [], check: { ok: true, issues: [] } };
  const { out, restore } = protect(text);
  const counts = new Map<Edit, number>();
  let s = out;
  for (const r of RULES) {
    s = s.replace(r.re, (...m) => {
      counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
      const groups = m.slice(1, -2) as (string | undefined)[];
      return r.to.replace(/\$(\d)/g, (_, i) => groups[Number(i) - 1] ?? "");
    });
  }
  const d = dedupeSentences(s);
  if (d.removed) counts.set("duplicate", d.removed);
  const tidied = tidy(capitalise(d.text));
  if (tidied !== d.text && tidy(out) !== out) counts.set("whitespace", 1);
  const result = restore(tidied);
  const after = estimateTokens(result);
  // Never hand back something longer or equal: the original wins.
  if (after >= before) return { text, before, after: before, saved: 0, ratio: 0, edits: [], check: { ok: true, issues: [] } };
  return {
    text: result,
    before,
    after,
    saved: before - after,
    ratio: (before - after) / before,
    edits: [...counts].map(([kind, count]) => ({ kind, count })),
    check: checkPreserved(text, result),
  };
}

/* ------------------------------ preservation ------------------------------ */

// Words that carry no instruction; their removal isn't a lost term.
const FILLER = new Set(
  "hi hello hey dear there team everyone hope doing well great good appreciate thanks thank much advance kindly basically actually literally honestly essentially important note noted regards cheers best order fact purpose point time event ability able number sure ensure use using keep".split(" "),
);
const NEGATION = /\b(not|no|never|none|nor|without|avoid|except|don't|dont|doesn't|didn't|won't|can't|cannot|shouldn't|mustn't|isn't|aren't)\b/gi;

const all = (re: RegExp, s: string) => s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? [];

/**
 * Deterministic check that a shorter prompt still says everything the
 * original said: the same numbers, URLs, code, quotes and placeholders, every
 * meaningful term, and at least as many negations ("don't", "without"...),
 * since dropping a negation flips the meaning. Used for local and AI results.
 */
export function checkPreserved(original: string, shorter: string): PreserveCheck {
  const issues: PreserveIssue[] = [];
  const has = (v: string) => shorter.includes(v);
  const exact: [PreserveIssue["kind"], RegExp][] = [
    ["code", /```[\s\S]*?```|`[^`\n]+`/g],
    ["url", /\bhttps?:\/\/[^\s<>"')\]]+|\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi],
    ["placeholder", /\{\{[^}]+\}\}/g],
    ["quote", /"[^"\n]{1,400}"|“[^”\n]{1,400}”/g],
  ];
  for (const [kind, re] of exact) for (const v of new Set(all(re, original))) if (!has(v)) issues.push({ kind, value: v.length > 60 ? v.slice(0, 57) + "..." : v });

  const nums = (s: string) => all(/\d[\d,.]*%?/g, s).map((n) => n.replace(/[.,]$/, ""));
  const pool = nums(shorter);
  for (const n of nums(original)) {
    const i = pool.indexOf(n);
    if (i >= 0) pool.splice(i, 1);
    else issues.push({ kind: "number", value: n });
  }

  const stem = (w: string) => w.replace(/(ing|ed|es|s|ly)$/, "");
  const kept = new Set(keyTerms(shorter).map(stem));
  // Negations are counted separately below ("don't use" may fairly become "no").
  const isNeg = (t: string) => new RegExp(`^(${NEGATION.source.slice(3, -3)})$`, "i").test(t);
  for (const t of keyTerms(original)) if (!FILLER.has(t) && !isNeg(t) && !/^\d/.test(t) && !kept.has(stem(t))) issues.push({ kind: "term", value: t });

  const neg = (s: string) => all(NEGATION, s).length;
  if (neg(shorter) < neg(original)) issues.push({ kind: "negation", value: all(NEGATION, original).join(", ") });

  return { ok: issues.length === 0, issues: issues.slice(0, 12) };
}
