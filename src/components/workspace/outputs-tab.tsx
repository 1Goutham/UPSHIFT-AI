"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronRight, FileText, Globe, Image as ImageIcon, RotateCw, Upload, Wand2 } from "lucide-react";
import type { Artifact, Evaluation, Finding, Prompt } from "@/lib/db/schema";
import { isFailing, isPassing } from "@/lib/engines/taxonomy";
import { api, Asterisk, CopyButton, Empty, ErrorNote, Field, MethodTag, SeverityTag, Spinner, StatusMark, useToast } from "../ui";
import { fmtTime, latestEvaluation, type Ctx } from "./types";

export function OutputsTab({ ctx }: { ctx: Ctx }) {
  const { ws } = ctx;
  const [selectedId, setSelectedId] = useState<string | null>(ws.artifacts[0]?.id ?? null);
  const [adding, setAdding] = useState(ws.artifacts.length === 0);
  useEffect(() => {
    if (!selectedId && ws.artifacts[0]) setSelectedId(ws.artifacts[0].id);
  }, [ws.artifacts, selectedId]);
  const selected = ws.artifacts.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="rise-in grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside aria-label="Output versions" className="lg:border-r lg:border-line lg:pr-5">
        <button type="button" className={`btn w-full ${adding ? "btn-ghost" : "btn-primary"}`} onClick={() => setAdding((v) => !v)}>
          <Upload className="h-4 w-4" /> {ws.artifacts.length ? `Add v${ws.artifacts.length + 1}` : "Add output"}
        </button>
        {ws.artifacts.length ? (
          <ol className="mt-4 flex gap-1 overflow-x-auto lg:flex-col lg:gap-px">
            {ws.artifacts.map((a) => {
              const ev = latestEvaluation(ws, a.id);
              const failing = ev ? ws.findings.filter((f) => f.evaluationId === ev.id && isFailing(f.status)).length : 0;
              return (
                <li key={a.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(a.id);
                      setAdding(false);
                    }}
                    aria-current={a.id === selectedId && !adding}
                    className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${a.id === selectedId && !adding ? "bg-raise" : "hover:bg-panel"}`}
                  >
                    <span className="flex items-center gap-2 text-[13px] text-ink">
                      <span className="font-mono text-ink-3">v{a.version}</span>
                      <KindIcon kind={a.kind} />
                      <span className="max-w-[9rem] truncate">{a.label}</span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-ink-3">
                      {!ev ? "not audited" : ev.status === "running" ? "auditing…" : ev.status === "failed" ? "audit failed" : `${failing} issue${failing === 1 ? "" : "s"}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
      </aside>

      <div className="min-w-0">
        {adding ? (
          <AddOutput
            ctx={ctx}
            onAdded={(id) => {
              setSelectedId(id);
              setAdding(false);
            }}
          />
        ) : selected ? (
          <VersionDetail key={selected.id} ctx={ctx} artifact={selected} />
        ) : (
          <Empty title="No outputs yet">Add what the AI produced: a live URL, a screenshot or image, or the text/code it wrote.</Empty>
        )}
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: string }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-ink-3";
  if (kind === "url") return <Globe className={cls} aria-label="URL" />;
  if (kind === "image") return <ImageIcon className={cls} aria-label="Image" />;
  return <FileText className={cls} aria-label={kind} />;
}

/* ------------------------------------------------------------------ */
/*  Add output                                                         */
/* ------------------------------------------------------------------ */

function AddOutput({ ctx, onAdded }: { ctx: Ctx; onAdded: (id: string) => void }) {
  const { ws, reload } = ctx;
  const [mode, setMode] = useState<"url" | "file" | "text" | "code">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmed = ws.requirements.filter((r) => r.status === "confirmed").length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let res: { artifact: Artifact };
      if (mode === "file") {
        if (!file) throw new Error("Choose a file first.");
        const fd = new FormData();
        fd.set("file", file);
        fd.set("label", label);
        fd.set("note", note);
        res = await api(`/api/projects/${ws.project.id}/artifacts`, { method: "POST", body: fd });
      } else if (mode === "url") {
        res = await api(`/api/projects/${ws.project.id}/artifacts`, { method: "POST", json: { kind: "url", url: /^https?:\/\//i.test(url) ? url : `https://${url}`, label, note } });
      } else {
        res = await api(`/api/projects/${ws.project.id}/artifacts`, { method: "POST", json: { kind: mode, text, label, note } });
      }
      await reload();
      onAdded(res.artifact.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setMode("file");
      setFile(f);
    }
  };

  const MODES = [
    { id: "url", label: "Website URL" },
    { id: "file", label: "Upload file" },
    { id: "text", label: "Paste text" },
    { id: "code", label: "Paste code" },
  ] as const;

  return (
    <form onSubmit={submit} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} className={`rounded-lg border p-5 transition-colors md:p-6 ${drag ? "border-accent bg-accent/5" : "border-line"}`}>
      <h2 className="text-base font-medium">Add version {ws.artifacts.length + 1}</h2>
      <p className="mt-1 text-sm text-ink-3">
        It will be audited against {confirmed ? `your ${confirmed} confirmed requirement${confirmed === 1 ? "" : "s"}` : "generic checks only (no confirmed requirements yet)"}.
      </p>

      <div role="tablist" className="mt-5 flex flex-wrap gap-1">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)} className={`btn btn-sm ${mode === m.id ? "btn-ghost text-ink" : "btn-quiet"}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {mode === "url" ? (
          <Field label="Public URL" hint="Must be publicly reachable. Private, local and internal addresses are refused.">
            <input value={url} onChange={(e) => setUrl(e.target.value)} required inputMode="url" placeholder="https://my-site.vercel.app" className="field-input" autoFocus />
          </Field>
        ) : mode === "file" ? (
          <div>
            <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-10 text-sm text-ink-2 transition-colors hover:border-ink-2 hover:text-ink">
              <Upload className="h-5 w-5" />
              {file ? (
                <span className="text-ink">
                  {file.name} <span className="text-ink-3">({(file.size / 1024).toFixed(0)} KB)</span>
                </span>
              ) : (
                <span>Drop a file here or choose one</span>
              )}
              <span className="text-xs text-ink-3">Screenshots/images (PNG, JPEG, WebP, GIF up to 8 MB) or text/code files up to 512 KB</span>
            </button>
            <input ref={inputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.html,.htm,.css,.js,.jsx,.ts,.tsx,.json,.py,.vue,.svelte" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        ) : (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="editor" placeholder={mode === "code" ? "Paste the code the AI produced" : "Paste the AI's response"} aria-label={mode === "code" ? "Code" : "Text"} required />
        )}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Field label="Label (optional)">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} className="field-input" placeholder={mode === "url" ? "Defaults to the domain" : "e.g. Lovable draft 2"} />
        </Field>
        <Field label="What changed / what's wrong (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="field-input" placeholder="e.g. Applied the mobile fix" />
        </Field>
      </div>

      {error ? (
        <div className="mt-5">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <div className="mt-6 flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Spinner /> : null} Add and audit
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Version detail                                                     */
/* ------------------------------------------------------------------ */

function VersionDetail({ ctx, artifact }: { ctx: Ctx; artifact: Artifact }) {
  const { ws, reload } = ctx;
  const toast = useToast();
  const evaluation = latestEvaluation(ws, artifact.id);
  const findings = useMemo(() => (evaluation ? ws.findings.filter((f) => f.evaluationId === evaluation.id) : []), [ws.findings, evaluation]);
  const [rerunning, setRerunning] = useState(false);

  const rerun = async () => {
    setRerunning(true);
    try {
      await api(`/api/projects/${ws.project.id}/artifacts/${artifact.id}/evaluate`, { method: "POST" });
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setRerunning(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-3">
            Version {artifact.version} · {fmtTime(artifact.createdAt)}
          </p>
          <h2 className="mt-1 truncate text-lg text-ink">{artifact.label}</h2>
          {artifact.sourceUrl ? (
            <a href={artifact.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="group mt-0.5 inline-flex items-center gap-1 break-all text-sm text-ink-2 hover:text-ink">
              {artifact.sourceUrl} <ArrowUpRight className="nudge h-3.5 w-3.5 shrink-0" />
            </a>
          ) : null}
          {artifact.note ? <p className="mt-1 text-sm text-ink-3">{artifact.note}</p> : null}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={rerun} disabled={rerunning || evaluation?.status === "running"} title="Audit again against the current confirmed requirements">
          {rerunning ? <Spinner /> : <RotateCw className="h-3.5 w-3.5" />} Re-run audit
        </button>
      </header>

      <ArtifactPreview projectId={ws.project.id} artifact={artifact} />

      {!evaluation ? (
        <Empty title="Not audited" action={<button className="btn btn-primary btn-sm" onClick={rerun}>Run audit</button>} />
      ) : evaluation.status === "running" ? (
        <Running artifact={artifact} provider={ctx.provider.configured} since={evaluation.createdAt} />
      ) : evaluation.status === "failed" ? (
        <ErrorNote message={`The audit could not finish: ${evaluation.error ?? "unknown error"}. Your output is saved; you can retry.`} onRetry={rerun} />
      ) : (
        <Results ctx={ctx} artifact={artifact} evaluation={evaluation} findings={findings} />
      )}
    </div>
  );
}

function ArtifactPreview({ projectId, artifact }: { projectId: string; artifact: Artifact }) {
  const [open, setOpen] = useState(false);
  if (artifact.kind === "image" && artifact.storageKey)
    return (
      <figure className="overflow-hidden rounded-lg border border-line bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/projects/${projectId}/files/${artifact.storageKey}`} alt={`Uploaded output version ${artifact.version}`} className="mx-auto max-h-[420px] w-auto object-contain" />
        <figcaption className="border-t border-line px-3 py-2 font-mono text-[11px] text-ink-3">
          {artifact.meta.width}×{artifact.meta.height} · {artifact.meta.format?.toUpperCase()} · {((artifact.sizeBytes ?? 0) / 1024).toFixed(0)} KB
        </figcaption>
      </figure>
    );
  if (artifact.textContent)
    return (
      <div className="rounded-lg border border-line">
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink-3 hover:text-ink" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          {artifact.kind === "code" ? "Code" : "Text"} · {artifact.meta.lines} lines
        </button>
        {open ? <pre className="prompt-out max-h-96 overflow-auto border-t border-line px-4 py-3">{artifact.textContent}</pre> : null}
      </div>
    );
  return null;
}

function Running({ artifact, provider, since }: { artifact: Artifact; provider: boolean; since: Date | string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(since).getTime();
    const t = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000))), 1000);
    return () => clearInterval(t);
  }, [since]);
  const steps =
    artifact.kind === "url"
      ? ["Fetching the page safely", "Markup checks", "Headless browser at 390px and 1440px", provider ? "Model review of requirements" : null]
      : artifact.kind === "image"
        ? ["Reading the image", provider ? "Model review of requirements" : null]
        : ["Static checks", provider ? "Model review of requirements" : null];
  return (
    <div className="rounded-lg border border-line p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <Spinner className="text-lg" />
        <p className="text-sm text-ink">Auditing version {artifact.version}</p>
        <span className="ml-auto font-mono text-xs text-ink-3">{elapsed}s</span>
      </div>
      <div className="relative mt-4 h-px overflow-hidden bg-line">
        <span className="progress-scan absolute inset-y-0 w-1/3 bg-accent" />
      </div>
      <ul className="mt-4 space-y-1 text-xs text-ink-3">
        {steps.filter(Boolean).map((s) => (
          <li key={s}>· {s}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-3">You can leave this page; the audit keeps running and the result is saved.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Results                                                            */
/* ------------------------------------------------------------------ */

type Filter = "issues" | "requirements" | "checks" | "all";

function Results({ ctx, artifact, evaluation, findings }: { ctx: Ctx; artifact: Artifact; evaluation: Evaluation; findings: Finding[] }) {
  const s = evaluation.summary;
  const failing = findings.filter((f) => isFailing(f.status));
  const [filter, setFilter] = useState<Filter>(failing.length ? "issues" : "requirements");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(failing.filter((f) => f.status === "verified_fail" || ["critical", "high", "medium"].includes(f.severity)).map((f) => f.id)));

  const reqFindings = findings.filter((f) => f.checkKey.startsWith("req:"));
  const total = evaluation.requirementSnapshot.length;
  const cov = {
    verified: reqFindings.filter((f) => f.status === "verified_pass").length,
    likely: reqFindings.filter((f) => f.status === "likely_pass").length,
    failing: reqFindings.filter((f) => isFailing(f.status)).length,
    untested: reqFindings.filter((f) => !isFailing(f.status) && !isPassing(f.status)).length,
  };

  const shown = findings.filter((f) =>
    filter === "issues" ? isFailing(f.status) : filter === "requirements" ? f.checkKey.startsWith("req:") : filter === "checks" ? !f.checkKey.startsWith("req:") : true,
  );

  return (
    <div className="space-y-8">
      {/* Coverage */}
      <section aria-labelledby="cov-h">
        <h3 id="cov-h" className="eyebrow mb-3">
          Requirement coverage
        </h3>
        {total ? (
          <>
            <p className="text-[15px] text-ink">
              {cov.verified + cov.likely} of {total} requirements met
              <span className="text-ink-3">
                {" "}
                ({cov.verified} verified, {cov.likely} judged by model) · {cov.failing} failing · {cov.untested} not tested
              </span>
            </p>
            <CoverageBar total={total} {...cov} />
            <p className="mt-2 text-xs text-ink-3">
              Counts your confirmed requirements only. It is not a measure of overall or creative quality.
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-3">No confirmed requirements were set when this audit ran, so only generic checks are shown.</p>
        )}
      </section>

      {/* Screenshots */}
      {s.screenshots?.length ? (
        <section aria-labelledby="shots-h">
          <h3 id="shots-h" className="eyebrow mb-3">
            Rendered in a real browser
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {[...s.screenshots].sort((a, b) => a.width - b.width).map((sh) => (
              <a key={sh.key} href={`/api/projects/${ctx.ws.project.id}/files/${sh.key}`} target="_blank" rel="noopener" className="group shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/projects/${ctx.ws.project.id}/files/${sh.key}`}
                  alt={`${sh.name} screenshot at ${sh.width}px`}
                  className={`h-64 rounded-md border border-line object-cover object-top transition-colors group-hover:border-line-strong ${sh.name === "mobile" ? "w-[118px]" : "w-[380px]"}`}
                />
                <span className="mt-1 block font-mono text-[11px] text-ink-3">
                  {sh.name} · {sh.width}px
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {/* Findings */}
      <section aria-labelledby="find-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 id="find-h" className="eyebrow">
            Findings
          </h3>
          <div role="tablist" aria-label="Filter findings" className="flex flex-wrap gap-1">
            {(
              [
                ["issues", `Issues ${failing.length}`],
                ["requirements", `Requirements ${reqFindings.length}`],
                ["checks", `Checks ${findings.length - reqFindings.length}`],
                ["all", "All"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={`btn btn-sm ${filter === id ? "btn-ghost text-ink" : "btn-quiet"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <Legend />
        {shown.length ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {shown.map((f) => (
              <FindingRow
                key={f.id}
                f={f}
                ctx={ctx}
                selectable={isFailing(f.status)}
                selected={selected.has(f.id)}
                onToggle={() =>
                  setSelected((prev) => {
                    const n = new Set(prev);
                    if (n.has(f.id)) n.delete(f.id);
                    else n.add(f.id);
                    return n;
                  })
                }
              />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-3">{filter === "issues" ? "No failing checks or likely issues in this audit." : "Nothing here."}</p>
        )}
      </section>

      {failing.length ? <CorrectionBuilder ctx={ctx} evaluation={evaluation} selected={[...selected].filter((id) => failing.some((f) => f.id === id))} artifact={artifact} /> : null}

      {/* How it was checked */}
      <section aria-labelledby="how-h" className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
        <div>
          <h3 id="how-h" className="eyebrow mb-2">
            How this was checked
          </h3>
          <ul className="space-y-1.5 text-sm">
            {(s.methods ?? []).map((m) => (
              <li key={m.id} className="flex gap-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.ran ? "bg-pass" : "border border-dashed border-ink-3"}`} aria-hidden />
                <span>
                  <span className={m.ran ? "text-ink" : "text-ink-3"}>{m.label}</span>
                  {!m.ran ? <span className="text-ink-3"> (not run)</span> : null}
                  {m.note ? <span className="block text-xs text-ink-3">{m.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {s.limitations?.length ? (
          <div>
            <h3 className="eyebrow mb-2">Not covered</h3>
            <ul className="space-y-1.5 text-sm text-ink-2">
              {s.limitations.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-px w-2 shrink-0 bg-ink-3" aria-hidden />
                  {l}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CoverageBar({ total, verified, likely, failing, untested }: { total: number; verified: number; likely: number; failing: number; untested: number }) {
  const seg = (n: number) => `${(n / Math.max(total, 1)) * 100}%`;
  return (
    <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-raise" aria-hidden>
      <span className="h-full bg-pass" style={{ width: seg(verified) }} />
      <span className="h-full bg-[repeating-linear-gradient(135deg,var(--pass)_0_3px,transparent_3px_6px)]" style={{ width: seg(likely) }} />
      <span className="h-full bg-fail" style={{ width: seg(failing) }} />
      <span className="h-full" style={{ width: seg(untested) }} />
    </div>
  );
}

function Legend() {
  const items = [
    ["verified_pass", "Verified"],
    ["likely_pass", "Model: met"],
    ["verified_fail", "Verified fail"],
    ["likely_issue", "Model: issue"],
    ["subjective", "Opinion"],
    ["not_tested", "Not tested"],
  ] as const;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map(([s, l]) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
          <StatusMark status={s} /> {l}
        </span>
      ))}
    </div>
  );
}

function FindingRow({ f, ctx, selectable, selected, onToggle }: { f: Finding; ctx: Ctx; selectable: boolean; selected: boolean; onToggle: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const reviewable = f.method !== "human" && !["verified_pass", "verified_fail"].includes(f.status) && f.checkKey.startsWith("req:");
  const hasDetail = f.detail || f.evidence || f.recommendation || f.verification;

  const review = async (verdict: "verified_pass" | "verified_fail") => {
    setBusy(true);
    try {
      await api(`/api/projects/${ctx.ws.project.id}/findings/${f.id}`, { method: "POST", json: { verdict } });
      await ctx.reload();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="flex w-5 shrink-0 justify-center pt-0.5">
          {selectable ? <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Include in correction: ${f.title}`} className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]" /> : null}
        </span>
        <span className="pt-1.5">
          <StatusMark status={f.status} method={f.method} />
        </span>
        <button type="button" onClick={() => hasDetail && setOpen((v) => !v)} aria-expanded={open} className={`min-w-0 flex-1 text-left ${hasDetail ? "cursor-pointer" : "cursor-default"}`}>
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm text-ink">{f.title}</span>
            {f.checkKey.startsWith("req:") ? <span className="tag">requirement</span> : null}
          </span>
          {!open && f.detail ? <span className="mt-0.5 block truncate text-xs text-ink-3">{f.detail}</span> : null}
        </button>
        <span className="flex shrink-0 items-center gap-2">
          {f.severity !== "info" ? <SeverityTag severity={f.severity} /> : null}
          <MethodTag method={f.method} />
        </span>
      </div>
      {open ? (
        <div className="ml-[3.25rem] mt-3 space-y-3 text-sm">
          <StatusMark status={f.status} method={f.method} withLabel />
          {f.detail ? <p className="text-ink-2">{f.detail}</p> : null}
          {f.evidence ? (
            <div>
              <p className="eyebrow mb-1">Evidence</p>
              <pre className="prompt-out max-h-48 overflow-auto rounded-md bg-panel px-3 py-2 text-xs">{f.evidence}</pre>
            </div>
          ) : null}
          {f.recommendation ? (
            <div>
              <p className="eyebrow mb-1">{f.method === "model" ? "Suggested fix" : "Fix"}</p>
              <p className="flex gap-2 text-ink-2">
                {f.method === "model" ? <Asterisk className="mt-1 text-[11px] text-accent" /> : null}
                {f.recommendation}
              </p>
            </div>
          ) : null}
          {f.verification ? (
            <div>
              <p className="eyebrow mb-1">Verify by</p>
              <p className="text-ink-2">{f.verification}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {reviewable ? (
        <div className="ml-[3.25rem] mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-3">Checked it yourself?</span>
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => review("verified_pass")}>
            Met
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => review("verified_fail")}>
            Not met
          </button>
        </div>
      ) : null}
    </li>
  );
}

function CorrectionBuilder({ ctx, evaluation, selected, artifact }: { ctx: Ctx; evaluation: Evaluation; selected: string[]; artifact: Artifact }) {
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Prompt | null>(null);

  const build = async () => {
    setBusy(true);
    setError("");
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/projects/${ctx.ws.project.id}/corrections`, { method: "POST", json: { evaluationId: evaluation.id, findingIds: selected, extra } });
      setResult(prompt);
      await ctx.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="fix-h" className="rounded-lg border border-line bg-panel p-5">
      <h3 id="fix-h" className="flex items-center gap-2 text-base font-medium">
        <Wand2 className="h-4 w-4 text-accent" aria-hidden /> Targeted correction
      </h3>
      <p className="mt-1 text-sm text-ink-3">
        {selected.length} issue{selected.length === 1 ? "" : "s"} selected. The prompt fixes only these, lists what already works so it is preserved, and asks the tool to verify each fix.
      </p>
      <div className="mt-4">
        <Field label="Anything else to say (optional)">
          <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={2000} className="field-input" placeholder="e.g. Keep the current colour palette exactly" />
        </Field>
      </div>
      {error ? (
        <div className="mt-3">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-accent" disabled={!selected.length || busy} onClick={build}>
          {busy ? <Spinner /> : null} Create correction prompt
        </button>
        {result ? <CopyButton text={result.content} label="Copy prompt" /> : null}
      </div>
      {result ? (
        <div className="rise-in mt-4">
          <pre className="prompt-out max-h-80 overflow-auto rounded-md border border-line bg-bg p-4">{result.content}</pre>
          <p className="mt-2 text-xs text-ink-3">
            Saved under Prompt → Versions. Run it in {ctx.ws.project.targetTool || "your AI tool"}, then add the result as v{ctx.ws.artifacts.length + 1} to compare against v{artifact.version}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
