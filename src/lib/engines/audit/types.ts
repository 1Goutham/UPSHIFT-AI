import type { FindingStatus, Severity } from "../taxonomy";

/** A finding before it is stored. `method` decides which statuses are allowed. */
export type FindingDraft = {
  checkKey: string;
  requirementId?: string | null;
  title: string;
  detail: string;
  status: FindingStatus;
  severity: Severity;
  evidence?: string;
  recommendation?: string;
  verification?: string;
  method: "deterministic" | "browser" | "model" | "human";
  category: string;
};

/**
 * Enforce the honesty rule in one place: only deterministic, browser and
 * human checks can produce verified results. A model judgement is downgraded
 * to "likely".
 */
export function enforceStatus(d: FindingDraft): FindingDraft {
  if (d.method === "model") {
    if (d.status === "verified_pass") return { ...d, status: "likely_pass" };
    if (d.status === "verified_fail") return { ...d, status: "likely_issue" };
  }
  return d;
}
