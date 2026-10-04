/** Shared vocabularies. Kept in one place so UI, engines and validation agree. */

export const CONTENT_TYPES = [
  { id: "website", label: "Website" },
  { id: "app", label: "Web app" },
  { id: "design", label: "UI / visual design" },
  { id: "image", label: "Image / graphic" },
  { id: "document", label: "Document" },
  { id: "code", label: "Code" },
  { id: "text", label: "Text / answer" },
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number]["id"];
export const CONTENT_TYPE_IDS = CONTENT_TYPES.map((c) => c.id) as [ContentType, ...ContentType[]];

export const CATEGORIES = [
  "objective",
  "audience",
  "content",
  "functionality",
  "visual",
  "responsive",
  "accessibility",
  "performance",
  "technical",
  "exclusion",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ["must", "should", "could"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ORIGINS = ["explicit", "inferred", "assumption", "baseline"] as const;
export const ORIGIN_LABEL: Record<string, string> = {
  explicit: "You said",
  inferred: "Inferred",
  assumption: "Assumption",
  baseline: "Baseline",
};

export const FINDING_STATUSES = [
  "verified_fail",
  "likely_issue",
  "unable_to_verify",
  "not_tested",
  "subjective",
  "likely_pass",
  "verified_pass",
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const STATUS_LABEL: Record<FindingStatus, string> = {
  verified_pass: "Verified pass",
  verified_fail: "Verified fail",
  likely_pass: "Likely met",
  likely_issue: "Likely issue",
  subjective: "Recommendation",
  not_tested: "Not tested",
  unable_to_verify: "Unable to verify",
};

export const STATUS_HELP: Record<FindingStatus, string> = {
  verified_pass: "Checked by a deterministic test or real browser run.",
  verified_fail: "A deterministic test or real browser run failed.",
  likely_pass: "A model judged this as met. Not proof; check it yourself if it matters.",
  likely_issue: "A model judged this as not met. Treat as a lead to confirm.",
  subjective: "A matter of judgement, not a pass or fail.",
  not_tested: "No available method covered this.",
  unable_to_verify: "A check was attempted but could not complete.",
};

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export const isFailing = (s: string) => s === "verified_fail" || s === "likely_issue";
export const isPassing = (s: string) => s === "verified_pass" || s === "likely_pass";
