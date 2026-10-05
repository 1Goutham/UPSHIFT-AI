import type { RefineResult } from "./types";

const isStr = (x: unknown): x is string => typeof x === "string";
const strArr = (x: unknown): string[] => (Array.isArray(x) ? x.filter(isStr) : []);

/**
 * Narrow an untrusted JSON reply to RefineResult. Anything malformed is
 * dropped or rejected; nothing from the network is rendered unchecked.
 */
export function parseRefineResult(raw: unknown): RefineResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isStr(r.refined) || !r.refined.trim()) return null;
  const a = (r.analysis ?? {}) as Record<string, unknown>;
  const c = (r.checks ?? {}) as Record<string, unknown>;
  const intent = (c.intent ?? {}) as Record<string, unknown>;
  const pairs = <K extends string, V extends string>(x: unknown, k: K, v: V) =>
    (Array.isArray(x) ? x : [])
      .filter((o): o is Record<string, unknown> => !!o && typeof o === "object" && isStr((o as Record<string, unknown>)[k]))
      .map((o) => ({ [k]: o[k] as string, [v]: isStr(o[v]) ? (o[v] as string) : "" }) as Record<K | V, string>);
  const num = (x: unknown, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x : d);
  return {
    id: isStr(r.id) ? r.id : null,
    refined: r.refined.slice(0, 40_000),
    model: isStr(r.model) ? r.model : "",
    analysis: {
      intent: isStr(a.intent) ? a.intent : "",
      taskType: isStr(a.taskType) ? a.taskType : "",
      strengths: strArr(a.strengths),
      ambiguities: pairs(a.ambiguities, "phrase", "why"),
      missingContext: pairs(a.missingContext, "item", "why"),
      assumptions: strArr(a.assumptions),
    },
    changes: pairs(r.changes, "change", "reason"),
    assumptions: strArr(r.assumptions),
    placeholders: strArr(r.placeholders),
    platformNotes: strArr(r.platformNotes),
    checks: {
      originalWords: num(c.originalWords),
      refinedWords: num(c.refinedWords),
      tooLong: c.tooLong === true,
      intent: { terms: num(intent.terms), kept: num(intent.kept), missing: strArr(intent.missing), ratio: num(intent.ratio, 1) },
    },
  };
}
