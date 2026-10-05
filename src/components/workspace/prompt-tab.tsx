"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Sparkles, Wand2 } from "lucide-react";
import type { Prompt, PromptWeakness } from "@/lib/db/schema";
import { api, Asterisk, CopyButton, downloadText, Empty, ErrorNote, Field, Spinner, useToast } from "../ui";
import { Dictate } from "../dictate";
import { fmtTime, type Ctx } from "./types";
import { PromptParts } from "../prompt-parts";

const KIND_LABEL: Record<string, string> = { original: "Original", optimized: "Improved", refined: "Refined", correction: "Correction" };
const METHOD_LABEL: Record<string, string> = { model: "model", deterministic: "structured", user: "you" };

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function PromptTab({ ctx }: { ctx: Ctx }) {
  const { ws } = ctx;
  const prompts = ws.prompts;
  const original = prompts.find((p) => p.kind === "original");
  const defaultId = (prompts.find((p) => p.kind !== "original" && p.kind !== "correction") ?? original)?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(defaultId);
  const selected = prompts.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId || !prompts.some((p) => p.id === selectedId)) setSelectedId(defaultId);
  }, [prompts, selectedId, defaultId]);

  return (
    <div className="rise-in grid gap-8 xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0 space-y-10">
        <OriginalSection ctx={ctx} original={original ?? null} onCreated={(id) => setSelectedId(id)} />
        {selected && selected.kind !== "original" ? (
          <PromptView key={selected.id} ctx={ctx} prompt={selected} original={prompts.find((p) => p.id === selected.parentId) ?? original ?? null} onCreated={setSelectedId} />
        ) : original ? (
          <Empty title="No improved version yet" />
        ) : null}
      </div>

      {prompts.length ? (
        <aside aria-label="Prompt versions" className="xl:border-l xl:border-line xl:pl-6">
          <p className="eyebrow mb-2">Versions</p>
          <ol className="space-y-px">
            {prompts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-current={p.id === selectedId}
                  className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${p.id === selectedId ? "bg-raise" : "hover:bg-panel"}`}
                >
                  <span className="flex items-center justify-between gap-2 text-[13px] text-ink">
                    {KIND_LABEL[p.kind] ?? p.kind}
                    <span className="font-mono text-[10px] text-ink-3">{METHOD_LABEL[p.method] ?? p.method}</span>
                  </span>
                  <span className="block font-mono text-[10px] text-ink-3">
                    {fmtTime(p.createdAt)} · {words(p.content)}w
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      ) : null}
    </div>
  );
}

function OriginalSection({ ctx, original, onCreated }: { ctx: Ctx; original: Prompt | null; onCreated: (id: string) => void }) {
  const { ws, provider, reload } = ctx;
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(!original);
  const [busy, setBusy] = useState<"" | "save" | "optimize">("");
  const [error, setError] = useState("");
  const [useModel, setUseModel] = useState(provider.configured);
  const confirmed = ws.requirements.filter((r) => r.status === "confirmed").length;

  const save = async () => {
    setBusy("save");
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/projects/${ws.project.id}/prompts`, { method: "POST", json: { content: draft } });
      setDraft("");
      setEditing(false);
      await reload();
      onCreated(prompt.id);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  const optimize = async () => {
    if (!original) return;
    setBusy("optimize");
    setError("");
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/projects/${ws.project.id}/prompts/${original.id}/optimize`, { method: "POST", json: { useModel } });
      await reload();
      onCreated(prompt.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  const weaknesses = (original?.analysis.weaknesses ?? []) as PromptWeakness[];

  return (
    <section aria-labelledby="orig-h">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="orig-h" className="eyebrow">
          Your prompt
        </h2>
        {original && !editing ? (
          <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={() => { setDraft(original.content); setEditing(true); }}>
            New version
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="relative">
            <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20000} className="editor" placeholder="Paste the prompt you used (or plan to use) in your AI tool." aria-label="Original prompt" />
            <div className="absolute bottom-2 right-2">
              <Dictate onText={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {original ? (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
            ) : null}
            <button type="button" className="btn btn-primary btn-sm" disabled={!draft.trim() || busy === "save"} onClick={save}>
              {busy === "save" ? <Spinner /> : null} Save prompt
            </button>
          </div>
        </div>
      ) : original ? (
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="prompt-out">{original.content}</p>
        </div>
      ) : null}

      {original && !editing ? (
        <>
          <div className="mt-6">
            <p className="mb-2 text-sm text-ink">
              {weaknesses.length ? `${weaknesses.length} gap${weaknesses.length === 1 ? "" : "s"}` : "No gaps found"}
            </p>
            {weaknesses.length ? <WeaknessList items={weaknesses} /> : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={optimize} disabled={!!busy || (!useModel && confirmed === 0) || (!provider.configured && confirmed === 0)}>
              {busy === "optimize" ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />} Improve prompt
            </button>
            {provider.configured ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-2">
                <input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} className="accent-[var(--accent)]" />
                Model
              </label>
            ) : null}
            {(!provider.configured || !useModel) && !confirmed ? <span className="text-xs text-ink-3">Confirm requirements first</span> : null}
          </div>
          {error ? (
            <div className="mt-3">
              <ErrorNote message={error} onRetry={optimize} />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function WeaknessList({ items }: { items: PromptWeakness[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((w, i) => (
        <li key={`${w.id}-${i}`} className="flex gap-3 py-2" title={w.detail}>
          <span className={`mt-0.5 w-14 shrink-0 font-mono text-[11px] uppercase ${w.severity === "high" ? "text-fail" : w.severity === "medium" ? "text-warn" : "text-ink-3"}`}>{w.severity}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">
              {w.label}
              {w.source === "model" ? <Asterisk className="ml-1.5 text-[10px] text-accent" /> : null}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PromptView({ ctx, prompt, original, onCreated }: { ctx: Ctx; prompt: Prompt; original: Prompt | null; onCreated: (id: string) => void }) {
  const { ws, provider, reload } = ctx;
  const toast = useToast();
  const variants = useMemo(
    () =>
      [
        { id: "main", label: prompt.kind === "correction" ? "Correction" : "Improved", text: prompt.content },
        prompt.concise ? { id: "concise", label: "Concise", text: prompt.concise } : null,
        prompt.detailed ? { id: "detailed", label: "Detailed", text: prompt.detailed } : null,
      ].filter(Boolean) as { id: string; label: string; text: string }[],
    [prompt],
  );
  const [variant, setVariant] = useState("main");
  const [showOriginal, setShowOriginal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<"" | "edit" | "refine">("");
  const [error, setError] = useState("");
  const current = variants.find((v) => v.id === variant) ?? variants[0];
  const a = prompt.analysis;

  const saveEdit = async () => {
    setBusy("edit");
    try {
      const { prompt: p } = await api<{ prompt: Prompt }>(`/api/projects/${ws.project.id}/prompts/${prompt.id}/edit`, { method: "POST", json: { content: draft } });
      setEditing(false);
      await reload();
      onCreated(p.id);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  const refine = async () => {
    setBusy("refine");
    setError("");
    try {
      const { prompt: p } = await api<{ prompt: Prompt }>(`/api/projects/${ws.project.id}/prompts/${prompt.id}/refine`, { method: "POST", json: { instruction } });
      setInstruction("");
      await reload();
      onCreated(p.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <section aria-labelledby="out-h" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="out-h" className="eyebrow">
            {prompt.kind === "correction" ? "Correction prompt" : "Improved prompt"}
          </h2>
          <p className="mt-1 font-mono text-[11px] text-ink-3">
            {prompt.method === "model" ? prompt.model : prompt.method === "deterministic" ? "from your brief" : "edited"} · {fmtTime(prompt.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CopyButton text={current.text} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadText(`${ws.project.name.replace(/\W+/g, "-").toLowerCase()}-prompt.md`, current.text, "text/markdown")}>
            <Download className="h-3.5 w-3.5" /> .md
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft(current.text); setEditing(true); }}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>

      {variants.length > 1 ? (
        <div role="tablist" aria-label="Prompt variants" className="flex gap-1">
          {variants.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={variant === v.id} onClick={() => setVariant(v.id)} className={`btn btn-sm ${variant === v.id ? "btn-ghost text-ink" : "btn-quiet"}`}>
              {v.label} <span className="font-mono text-[10px] text-ink-3">{words(v.text)}w</span>
            </button>
          ))}
        </div>
      ) : null}

      {editing ? (
        <div className="space-y-3">
          <textarea rows={16} value={draft} onChange={(e) => setDraft(e.target.value)} className="editor" aria-label="Edit prompt" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy === "edit" || !draft.trim()} onClick={saveEdit}>
              {busy === "edit" ? <Spinner /> : null} Save as new version
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-panel p-4 md:p-5">
          {prompt.kind === "correction" && prompt.analysis.parts?.length ? <PromptParts content={prompt.content} parts={prompt.analysis.parts} /> : <p className="prompt-out">{current.text}</p>}
        </div>
      )}

      {original && prompt.kind !== "correction" ? (
        <div className="text-xs text-ink-3">
          <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => setShowOriginal((v) => !v)}>
            {showOriginal ? "Hide" : "Show"} original side by side
          </button>
          <span className="ml-3 font-mono">
            {words(original.content)}w → {words(current.text)}w
          </span>
          {showOriginal ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-line p-4">
                <p className="eyebrow mb-2">Original</p>
                <p className="prompt-out">{original.content}</p>
              </div>
              <div className="rounded-lg border border-line p-4">
                <p className="eyebrow mb-2">{current.label}</p>
                <p className="prompt-out">{current.text}</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {a.changes?.length || a.preserved?.length || a.assumptions?.length || a.toolNotes?.length ? (
      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-ink-3 hover:text-ink">
          <span className="group-open:hidden">Why these changes</span>
          <span className="hidden group-open:inline">Hide</span>
        </summary>
        <div className="mt-4 space-y-6">
      {a.changes?.length ? (
        <div>
          <ul className="space-y-2">
            {a.changes.map((c, i) => (
              <li key={i} className="text-sm">
                <span className="text-ink">{c.change}</span> <span className="text-ink-3">{c.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        {a.preserved?.length ? <NoteList title="Kept from your prompt" items={a.preserved} /> : null}
        {a.assumptions?.length ? <NoteList title="Assumptions to check" items={a.assumptions} /> : null}
        {a.toolNotes?.length ? <NoteList title={`Specific to ${prompt.targetTool || "the target tool"}`} items={a.toolNotes} /> : null}
      </div>
        </div>
      </details>
      ) : null}

      {prompt.kind !== "correction" && provider.configured ? (
        <div className="border-t border-line pt-6">
          <Field label="Refine">
            <div className="flex items-end gap-2">
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && instruction.trim().length >= 3 && provider.configured && refine()}
                disabled={!provider.configured}
                maxLength={2000}
                className="field-input"
                placeholder="e.g. Make it a one-page site"
              />
              <button type="button" className="btn btn-ghost btn-sm" disabled={!provider.configured || instruction.trim().length < 3 || busy === "refine"} onClick={refine}>
                {busy === "refine" ? <Spinner /> : <Wand2 className="h-3.5 w-3.5" />} Refine
              </button>
            </div>
          </Field>
          {error ? (
            <div className="mt-3">
              <ErrorNote message={error} onRetry={refine} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function NoteList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-sm text-ink">{title}</p>
      <ul className="space-y-1.5 text-sm text-ink-2">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-px w-2 shrink-0 bg-ink-3" aria-hidden />
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}
