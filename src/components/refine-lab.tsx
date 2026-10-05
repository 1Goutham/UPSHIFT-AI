"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { lintPrompt } from "@/lib/engines/prompt-lint";
import { wordDiff } from "@/lib/refine/intent-check";
import { MODES, PLATFORMS, type Mode } from "@/lib/refine/platforms";
import { api, Asterisk, CopyButton, ErrorNote, Spinner, useToast } from "./ui";
import { Dictate } from "./dictate";

type Result = {
  id: string | null;
  refined: string;
  model: string;
  analysis: { intent: string; taskType: string; ambiguities: { phrase: string; why: string }[]; missingContext: { item: string; why: string }[] };
  changes: { change: string; reason: string }[];
  assumptions: string[];
  placeholders: string[];
  platformNotes: string[];
  checks: { originalWords: number; refinedWords: number; tooLong: boolean; intent: { terms: number; kept: number; missing: string[]; ratio: number } };
};
type Saved = { id: string; platform: string; mode: string; original: string; refined: string; result: Result; createdAt: string };

const MODE_HINT: Record<Mode, string> = { quick: "Light touch", deep: "Restructure", expert: "Tuned for the tool" };

export function RefineLab({ modelReady, canSave }: { modelReady: boolean; canSave: boolean }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("chatgpt");
  const [mode, setMode] = useState<Mode>("quick");
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ original: string; r: Result } | null>(null);
  const [view, setView] = useState<"after" | "diff">("after");
  const [history, setHistory] = useState<Saved[]>([]);

  const gaps = useMemo(() => (prompt.trim() ? lintPrompt(prompt) : []), [prompt]);

  const loadHistory = useCallback(async () => {
    if (!canSave) return;
    try {
      setHistory((await api<{ refinements: Saved[] }>("/api/refinements")).refinements);
    } catch {
      /* history is optional */
    }
  }, [canSave]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const refine = async () => {
    if (!prompt.trim()) return setError("Add a prompt first.");
    setBusy(true);
    setError("");
    try {
      const r = await api<Result>("/api/refine", { method: "POST", json: { prompt, platform, mode, save: save && canSave, source: "web" } });
      setResult({ original: prompt, r });
      setView("after");
      if (r.id) loadHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    await api(`/api/refinements/${id}`, { method: "DELETE" }).catch((e) => toast(e.message, "error"));
    loadHistory();
  };

  const r = result?.r;
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && refine()}
            rows={6}
            maxLength={12000}
            placeholder="Paste or write the prompt you're about to send"
            aria-label="Prompt"
            className="editor text-[13px]"
          />
          <div className="absolute bottom-2 right-2">
            <Dictate onText={(t) => setPrompt((p) => (p ? `${p} ${t}` : t))} />
          </div>
        </div>

        {prompt.trim() ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink">{gaps.length ? `Vague in ${gaps.length} area${gaps.length === 1 ? "" : "s"}` : "No common gaps"}</span>
            {gaps.slice(0, 6).map((g) => (
              <span key={g.id} className="tag" title={g.detail}>
                + {g.label}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <label className="field inline-block">
            <span className="sr-only">AI tool</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="field-input w-36 text-sm">
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="other">Other</option>
            </select>
            <span className="field-line" aria-hidden />
          </label>
          <div role="radiogroup" aria-label="Depth" className="flex rounded-md bg-raise p-0.5">
            {MODES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} title={MODE_HINT[m]} onClick={() => setMode(m)} className={`h-8 rounded px-3 text-xs capitalize ${mode === m ? "bg-bg text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-ink-3 hover:text-ink"}`}>
                {m}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-accent" onClick={refine} disabled={busy || !modelReady || !prompt.trim()}>
            {busy ? <Spinner /> : <Sparkles className="h-4 w-4" />} Refine
          </button>
          {canSave ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-3">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-[var(--accent)]" /> Save to history
            </label>
          ) : null}
          {!modelReady ? <span className="text-xs text-ink-3">Needs a model on the server</span> : null}
        </div>
        {error ? <ErrorNote message={error} onRetry={prompt.trim() ? refine : undefined} /> : null}
      </section>

      {r && result ? (
        <section className="rise-in space-y-4" aria-label="Refined prompt">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {r.analysis.taskType ? <span className="text-ink">{r.analysis.taskType}</span> : null}
            {r.analysis.intent ? <span className="text-ink-3">· {r.analysis.intent}</span> : null}
          </div>
          {r.analysis.missingContext.length || r.analysis.ambiguities.length ? (
            <div className="flex flex-wrap gap-1.5">
              {r.analysis.missingContext.map((m) => (
                <span key={m.item} className="tag" title={m.why}>
                  + {m.item}
                </span>
              ))}
              {r.analysis.ambiguities.map((a) => (
                <span key={a.phrase} className="tag suggested" title={a.why}>
                  “{a.phrase}”
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <div role="tablist" className="flex gap-1">
              {(["after", "diff"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`btn btn-sm ${view === v ? "btn-ghost text-ink" : "btn-quiet"}`}>
                  {v === "after" ? "Refined" : "Changes"}
                </button>
              ))}
            </div>
            <CopyButton text={r.refined} />
          </div>
          <div className="rounded-lg border border-line bg-panel p-4">
            {view === "after" ? (
              <p className="prompt-out">{r.refined}</p>
            ) : (
              <p className="prompt-out">
                {wordDiff(result.original, r.refined).map((p, i) =>
                  p.type === "same" ? (
                    <span key={i}>{p.text}</span>
                  ) : (
                    <span key={i} className={p.type === "add" ? "rounded-sm bg-accent/15 text-ink" : "text-fail line-through opacity-70"}>
                      {p.text}
                    </span>
                  ),
                )}
              </p>
            )}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-3">
            <span className={r.checks.intent.ratio >= 0.8 ? "text-pass" : "text-warn"} title={r.checks.intent.missing.length ? `Missing: ${r.checks.intent.missing.join(", ")}` : ""}>
              kept {r.checks.intent.kept}/{r.checks.intent.terms} key terms
            </span>
            <span>
              {r.checks.originalWords} to {r.checks.refinedWords} words
            </span>
            {r.checks.tooLong ? <span className="text-warn">longer than a quick edit should be</span> : null}
            <span>{r.model}</span>
          </p>
          {[...r.assumptions, ...r.placeholders.map((p) => `Fill in ${p}`)].length || r.changes.length || r.platformNotes.length ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-ink-3 hover:text-ink">Why these changes</summary>
              <div className="mt-3 grid gap-5 text-sm md:grid-cols-2">
                {r.changes.length ? (
                  <ul className="space-y-1">
                    {r.changes.map((c, i) => (
                      <li key={i} title={c.reason} className="text-ink-2">
                        + {c.change}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {[...r.assumptions, ...r.placeholders.map((p) => `Fill in ${p}`)].length ? (
                  <ul className="space-y-1">
                    {[...r.assumptions, ...r.placeholders.map((p) => `Fill in ${p}`)].map((x, i) => (
                      <li key={i} className="flex gap-2 text-ink-2">
                        <Asterisk className="mt-1 text-[10px] text-accent" />
                        {x}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {r.platformNotes.length ? (
                  <ul className="space-y-1 md:col-span-2">
                    {r.platformNotes.map((x, i) => (
                      <li key={i} className="border-l border-line-strong pl-3 text-ink-2">
                        {x}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {history.length ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">History</h2>
            <button
              type="button"
              className="text-xs text-ink-3 hover:text-ink"
              onClick={async () => {
                await api("/api/refinements", { method: "DELETE" }).catch(() => {});
                loadHistory();
              }}
            >
              Clear
            </button>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {history.map((h) => (
              <li key={h.id} className="group flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setPrompt(h.original);
                    setPlatform(h.platform);
                    setMode(h.mode as Mode);
                    setResult({ original: h.original, r: h.result });
                  }}
                >
                  <span className="block truncate text-sm text-ink">{h.original}</span>
                  <span className="font-mono text-[11px] text-ink-3">
                    {h.mode} · {PLATFORMS.find((p) => p.id === h.platform)?.label ?? h.platform} · {new Date(h.createdAt).toLocaleString()}
                  </span>
                </button>
                <button type="button" className="btn btn-quiet btn-sm opacity-60 group-hover:opacity-100" aria-label="Delete" onClick={() => del(h.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
