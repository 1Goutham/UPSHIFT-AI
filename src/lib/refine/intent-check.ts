import { VAGUE_TERMS } from "../engines/prompt-lint";

/** Vague quality words are meant to be replaced by specifics, so dropping them isn't drift. */
const VAGUE = new Set(VAGUE_TERMS.flatMap((t) => t.split(/[\s-]+/)));

/**
 * Deterministic guard against intent drift: which meaningful words of the
 * original prompt survive in the refined one. Pure; shared with the extension.
 */
const STOP = new Set(
  "a an the and or but if then so to of in on at for with from by as is are was were be been being it its this that these those i me my we our you your he she they them their do does did can could should would will shall may might must make makes made build create want need please just some any very really also into about over under more most less like get got have has had not no yes what which who whom how why when where all each every both few other such only own same than too s t".split(
    " ",
  ),
);

export function keyTerms(text: string): string[] {
  // Hyphenated compounds count as their parts ("dark-themed" keeps "dark").
  const words = text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}']*/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    const t = w.replace(/'s$/, "");
    if (t.length < 3 || STOP.has(t) || VAGUE.has(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

const stem = (w: string) => w.replace(/(ing|ed|es|s|ly)$/, "");

export function intentCoverage(original: string, refined: string) {
  const terms = keyTerms(original);
  const hay = new Set(keyTerms(refined).map(stem));
  const missing = terms.filter((t) => !hay.has(stem(t)));
  return { terms: terms.length, kept: terms.length - missing.length, missing, ratio: terms.length ? (terms.length - missing.length) / terms.length : 1 };
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Word-level diff (LCS) for the before/after view. */
export type DiffPart = { type: "same" | "add" | "del"; text: string };
export function wordDiff(a: string, b: string, maxTokens = 1500): DiffPart[] {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  if (A.length > maxTokens || B.length > maxTokens) return [{ type: "del", text: a }, { type: "add", text: b }];
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      push("same", A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", A[i++]);
    else push("add", B[j++]);
  }
  while (i < A.length) push("del", A[i++]);
  while (j < B.length) push("add", B[j++]);
  return out;
}
