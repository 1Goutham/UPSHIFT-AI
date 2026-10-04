"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { CHANGE_LABEL, compareFindings, type ChangeKind } from "@/lib/engines/compare";
import { Empty, MethodTag, StatusMark } from "../ui";
import { latestEvaluation, type Ctx } from "./types";

const TONE: Partial<Record<ChangeKind, string>> = {
  improved: "text-pass",
  newly_tested: "text-pass",
  regressed: "text-fail",
  new_issue: "text-fail",
  still_failing: "text-warn",
};

export function CompareTab({ ctx }: { ctx: Ctx }) {
  const { ws } = ctx;
  const audited = ws.artifacts.filter((a) => latestEvaluation(ws, a.id)?.status === "complete");
  const [aId, setA] = useState(audited[1]?.id ?? "");
  const [bId, setB] = useState(audited[0]?.id ?? "");
  const a = ws.artifacts.find((x) => x.id === aId);
  const b = ws.artifacts.find((x) => x.id === bId);
  const ea = a ? latestEvaluation(ws, a.id) : null;
  const eb = b ? latestEvaluation(ws, b.id) : null;

  const result = useMemo(() => {
    if (!ea || !eb) return null;
    return compareFindings(
      ws.findings.filter((f) => f.evaluationId === ea.id),
      ws.findings.filter((f) => f.evaluationId === eb.id),
    );
  }, [ea, eb, ws.findings]);

  const [showStable, setShowStable] = useState(false);

  if (audited.length < 2)
    return (
      <div className="rise-in mx-auto max-w-3xl">
        <Empty title="Need two audited versions">
          Add the AI&rsquo;s next attempt as a new version in Outputs. Both versions are checked against the same requirements so changes line up.
        </Empty>
      </div>
    );

  const reqChanged = (() => {
    if (!ea || !eb) return false;
    const ka = new Set(ea.requirementSnapshot.map((r) => r.id));
    const kb = new Set(eb.requirementSnapshot.map((r) => r.id));
    return ka.size !== kb.size || [...ka].some((k) => !kb.has(k));
  })();

  const headline: ChangeKind[] = ["improved", "regressed", "still_failing", "new_issue", "resolved_or_removed"];
  const visible = result?.changes.filter((c) => showStable || !["still_passing", "unchanged_other"].includes(c.kind)) ?? [];

  return (
    <div className="rise-in mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-end gap-4">
        <VersionSelect label="Before" value={aId} onChange={setA} options={audited} />
        <ArrowRight className="mb-2 h-4 w-4 text-ink-3" aria-hidden />
        <VersionSelect label="After" value={bId} onChange={setB} options={audited} />
      </div>

      {reqChanged ? (
        <p className="text-xs text-warn">The requirement set changed between these audits. Re-run the older audit in Outputs for a like-for-like comparison.</p>
      ) : null}

      {result && aId !== bId ? (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
            {headline.map((k) => (
              <div key={k} className="bg-bg px-4 py-3">
                <dt className="text-[11px] text-ink-3">{CHANGE_LABEL[k]}</dt>
                <dd className={`mt-1 font-mono text-2xl ${result.summary[k] ? (TONE[k] ?? "text-ink") : "text-ink-3"}`}>{result.summary[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-3">
            Lined up by requirement and check. Changes from model judgements are marked; a model changing its mind is weaker evidence than a check flipping.
          </p>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="eyebrow">Changes</h2>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-3">
                <input type="checkbox" checked={showStable} onChange={(e) => setShowStable(e.target.checked)} className="accent-[var(--accent)]" /> Show unchanged
              </label>
            </div>
            <ul className="divide-y divide-line border-y border-line">
              {visible.map((c) => (
                <li key={c.checkKey} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 py-2.5 sm:grid-cols-[140px_1fr_auto]">
                  <span className={`font-mono text-[11px] uppercase ${TONE[c.kind] ?? "text-ink-3"}`}>{CHANGE_LABEL[c.kind]}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{c.title}</span>
                    {c.isRequirement ? <span className="text-[11px] text-ink-3">requirement</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {c.before ? <StatusMark status={c.before} /> : <span className="w-2.5 text-center text-ink-3">–</span>}
                    <ArrowRight className="h-3 w-3 text-ink-3" aria-hidden />
                    {c.after ? <StatusMark status={c.after} /> : <span className="w-2.5 text-center text-ink-3">–</span>}
                    <MethodTag method={c.method} />
                  </span>
                </li>
              ))}
              {!visible.length ? <li className="py-3 text-sm text-ink-3">No status changes between these versions.</li> : null}
            </ul>
          </section>

          {ea?.summary.screenshots?.length && eb?.summary.screenshots?.length ? (
            <section>
              <h2 className="eyebrow mb-3">Side by side</h2>
              {["mobile", "desktop"].map((name) => {
                const sa = ea.summary.screenshots!.find((s) => s.name === name);
                const sb = eb.summary.screenshots!.find((s) => s.name === name);
                if (!sa || !sb) return null;
                return (
                  <div key={name} className="mb-6">
                    <p className="mb-2 font-mono text-[11px] text-ink-3">
                      {name} · {sa.width}px
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        [sa, a!],
                        [sb, b!],
                      ].map(([s, art]) => (
                        <figure key={(s as { key: string }).key}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/projects/${ws.project.id}/files/${(s as { key: string }).key}`} alt={`v${(art as { version: number }).version} ${name}`} className="max-h-[520px] w-full rounded-md border border-line object-cover object-top" />
                          <figcaption className="mt-1 font-mono text-[11px] text-ink-3">v{(art as { version: number }).version}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-ink-3">Pick two different versions.</p>
      )}
    </div>
  );
}

function VersionSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; version: number; label: string }[] }) {
  return (
    <label className="field block w-56">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field-input text-sm">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            v{o.version} · {o.label}
          </option>
        ))}
      </select>
      <span className="field-line" aria-hidden />
    </label>
  );
}
