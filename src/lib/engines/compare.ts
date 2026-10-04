import { isFailing, isPassing } from "./taxonomy";

type F = { checkKey: string; title: string; status: string; severity: string; method: string; requirementId?: string | null };

export type ChangeKind = "improved" | "regressed" | "still_failing" | "still_passing" | "new_issue" | "resolved_or_removed" | "newly_tested" | "now_untested" | "unchanged_other";

export type Change = { checkKey: string; title: string; kind: ChangeKind; before?: string; after?: string; severity: string; isRequirement: boolean; method: string };

/**
 * Line up findings from two evaluations by their stable checkKey and classify
 * each transition. Only status transitions are compared; wording differences
 * from a model are ignored, and a model verdict flipping is labelled with the
 * method so the user can weigh it.
 */
export function compareFindings(before: F[], after: F[]): { changes: Change[]; summary: Record<ChangeKind, number> } {
  const a = new Map(before.map((f) => [f.checkKey, f]));
  const b = new Map(after.map((f) => [f.checkKey, f]));
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const changes: Change[] = [];

  for (const k of keys) {
    const x = a.get(k);
    const y = b.get(k);
    const ref = y ?? x!;
    const base = { checkKey: k, title: ref.title, before: x?.status, after: y?.status, severity: y?.severity ?? x!.severity, isRequirement: k.startsWith("req:"), method: ref.method };
    let kind: ChangeKind;
    if (!x) kind = isFailing(y!.status) ? "new_issue" : isPassing(y!.status) ? "newly_tested" : "unchanged_other";
    else if (!y) kind = isFailing(x.status) ? "resolved_or_removed" : "now_untested";
    else if (isFailing(x.status) && isPassing(y.status)) kind = "improved";
    else if (isPassing(x.status) && isFailing(y.status)) kind = "regressed";
    else if (isFailing(x.status) && isFailing(y.status)) kind = "still_failing";
    else if (isPassing(x.status) && isPassing(y.status)) kind = "still_passing";
    else if (!isPassing(x.status) && !isFailing(x.status) && isFailing(y.status)) kind = "new_issue";
    else if (!isPassing(x.status) && !isFailing(x.status) && isPassing(y.status)) kind = "newly_tested";
    else if ((isPassing(x.status) || isFailing(x.status)) && !isPassing(y.status) && !isFailing(y.status)) kind = "now_untested";
    else kind = "unchanged_other";
    changes.push({ ...base, kind });
  }

  const order: ChangeKind[] = ["regressed", "new_issue", "still_failing", "improved", "resolved_or_removed", "newly_tested", "now_untested", "still_passing", "unchanged_other"];
  changes.sort((p, q) => order.indexOf(p.kind) - order.indexOf(q.kind) || Number(q.isRequirement) - Number(p.isRequirement));
  const summary = Object.fromEntries(order.map((o) => [o, 0])) as Record<ChangeKind, number>;
  for (const c of changes) summary[c.kind]++;
  return { changes, summary };
}

export const CHANGE_LABEL: Record<ChangeKind, string> = {
  improved: "Improved",
  regressed: "Regressed",
  still_failing: "Still failing",
  still_passing: "Still passing",
  new_issue: "New issue",
  resolved_or_removed: "No longer reported",
  newly_tested: "Newly passing",
  now_untested: "Not checked this time",
  unchanged_other: "Unchanged",
};
