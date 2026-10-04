"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { CATEGORIES, ORIGIN_LABEL, PRIORITIES } from "@/lib/engines/taxonomy";
import type { Requirement } from "@/lib/db/schema";
import { api, Asterisk, Empty, ErrorNote, Field, Spinner, useToast } from "../ui";
import type { Ctx } from "./types";

export function BriefTab({ ctx }: { ctx: Ctx }) {
  const { ws, provider, reload } = ctx;
  const toast = useToast();
  const p = ws.project;
  const brief = p.brief;
  const original = ws.prompts.find((x) => x.kind === "original");
  const [goal, setGoal] = useState(p.goal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [useModel, setUseModel] = useState(provider.configured);
  useEffect(() => setGoal(p.goal), [p.goal]);

  const proposed = ws.requirements.filter((r) => r.status === "proposed");
  const confirmed = ws.requirements.filter((r) => r.status === "confirmed");
  const rejected = ws.requirements.filter((r) => r.status === "rejected");

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      if (goal !== p.goal) await api(`/api/projects/${p.id}`, { method: "PATCH", json: { goal } });
      await api(`/api/projects/${p.id}/brief`, { method: "POST", json: { prompt: original?.content ?? "", useModel } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (json: Record<string, unknown>) => {
    try {
      await api(`/api/projects/${p.id}`, { method: "PATCH", json });
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const hasBrief = !!brief.generatedAt;

  return (
    <div className="rise-in mx-auto max-w-3xl space-y-10">
      {/* Goal */}
      <section aria-labelledby="goal-h">
        <h2 id="goal-h" className="eyebrow mb-3">
          Intended result
        </h2>
        <Field label="What should the AI help you achieve?">
          <textarea rows={3} maxLength={4000} value={goal} onChange={(e) => setGoal(e.target.value)} onBlur={() => goal !== p.goal && patch({ goal })} className="field-input" placeholder="e.g. A portfolio site that makes recruiters remember me, works on phones, and shows 3 case studies." />
        </Field>
        {original ? (
          <p className="mt-3 text-xs text-ink-3">
            Your original prompt ({original.content.split(/\s+/).length} words) is also used. Edit it in <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => ctx.setTab("prompt")}>Prompt</button>.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={busy || (!goal.trim() && !original)} onClick={generate}>
            {busy ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {hasBrief ? "Rebuild brief" : "Build brief"}
          </button>
          {provider.configured ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-2">
              <input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} className="accent-[var(--accent)]" />
              Use model ({provider.model})
            </label>
          ) : (
            <span className="text-xs text-ink-3">No model configured: the brief is built from your own words plus a labelled baseline.</span>
          )}
        </div>
        {busy ? <p className="mt-3 text-xs text-ink-3">{useModel && provider.configured ? "Reading your goal and prompt. This usually takes 10–40 seconds." : "Splitting your goal into checkable requirements…"}</p> : null}
        {error ? (
          <div className="mt-3">
            <ErrorNote message={error} onRetry={generate} />
          </div>
        ) : null}
        {hasBrief && proposed.length === 0 && confirmed.length > 0 ? (
          <p className="mt-3 text-xs text-ink-3">Rebuilding keeps every confirmed requirement and replaces unreviewed suggestions.</p>
        ) : null}
      </section>

      {hasBrief ? <BriefDetails ctx={ctx} onPatch={patch} /> : null}

      {/* Requirements */}
      <section aria-labelledby="req-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="req-h" className="eyebrow">
            Acceptance checklist · {confirmed.length} confirmed
          </h2>
          <p className="text-xs text-ink-3">Audits are run against confirmed items only.</p>
        </div>

        {proposed.length ? (
          <div className="mb-6 rounded-lg border border-dashed border-line-strong p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-ink">
                <Asterisk className="text-accent" /> {proposed.length} suggested. Review before they count.
              </p>
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={async () => {
                  await api(`/api/projects/${p.id}/requirements/confirm`, { method: "POST" }).catch((e) => toast(e.message, "error"));
                  await reload();
                }}
              >
                <Check className="h-3.5 w-3.5" /> Accept all
              </button>
            </div>
            <ul className="divide-y divide-line">
              {proposed.map((r) => (
                <RequirementRow key={r.id} r={r} ctx={ctx} />
              ))}
            </ul>
          </div>
        ) : null}

        {confirmed.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {confirmed.map((r) => (
              <RequirementRow key={r.id} r={r} ctx={ctx} />
            ))}
          </ul>
        ) : !proposed.length ? (
          <Empty title="No requirements yet">Build the brief from your goal, or add requirements yourself below.</Empty>
        ) : null}

        <AddRequirement ctx={ctx} />

        {rejected.length ? (
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink">{rejected.length} rejected</summary>
            <ul className="mt-2 divide-y divide-line">
              {rejected.map((r) => (
                <RequirementRow key={r.id} r={r} ctx={ctx} />
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function BriefDetails({ ctx, onPatch }: { ctx: Ctx; onPatch: (j: Record<string, unknown>) => Promise<void> }) {
  const brief = ctx.ws.project.brief;
  const fields = [
    ["audience", "Audience"],
    ["objective", "Objective"],
    ["visualDirection", "Visual direction"],
    ["technicalConstraints", "Technical constraints"],
    ["exclusions", "Exclusions"],
  ] as const;
  const fromModel = brief.method?.startsWith("model");
  return (
    <section aria-labelledby="brief-h" className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h2 id="brief-h" className="eyebrow">
          Brief
        </h2>
        <span className="font-mono text-[11px] text-ink-3">{fromModel ? `drafted by ${brief.method?.slice(6)}` : "built from your words"}</span>
      </div>
      {brief.summary ? <p className="text-[15px] leading-relaxed text-ink-2">{brief.summary}</p> : null}

      {brief.questions?.length ? (
        <div>
          <p className="mb-3 text-sm text-ink">A few answers would sharpen this</p>
          <div className="space-y-5">
            {brief.questions.map((q) => (
              <Answer key={q.id} q={q} onSave={(answer) => onPatch({ brief: { answers: { [q.id]: answer } } })} />
            ))}
          </div>
        </div>
      ) : null}

      {fromModel ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {fields.map(([key, label]) => (
            <BriefField key={key} label={label} value={(brief[key] as string) ?? ""} onSave={(v) => onPatch({ brief: { [key]: v } })} />
          ))}
        </div>
      ) : null}

      {brief.ambiguities?.length ? (
        <div>
          <p className="mb-2 text-sm text-ink">Possible contradictions</p>
          <ul className="space-y-2">
            {brief.ambiguities.map((a, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rotate-45 border border-warn" aria-hidden />
                <span>
                  <span className="text-ink">{a.issue}</span> <span className="text-ink-3">{a.why}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.assumptions?.length ? (
        <div>
          <p className="mb-2 text-sm text-ink">Assumed, not asked</p>
          <ul className="space-y-1.5 text-sm text-ink-2">
            {brief.assumptions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <Asterisk className="mt-1 text-[11px] text-ink-3" />
                {a}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-3">If any of these are wrong, add a requirement that says otherwise.</p>
        </div>
      ) : null}
    </section>
  );
}

function Answer({ q, onSave }: { q: { id: string; question: string; why: string; answer?: string }; onSave: (a: string) => void }) {
  const [v, setV] = useState(q.answer ?? "");
  return (
    <Field label={q.question} hint={q.why}>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (q.answer ?? "") && onSave(v)} className="field-input" placeholder="Your answer" />
    </Field>
  );
}

function BriefField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Field label={label}>
      <textarea rows={2} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} className="field-input text-sm" placeholder="Not specified" />
    </Field>
  );
}

function RequirementRow({ r, ctx }: { r: Requirement; ctx: Ctx }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ text: r.text, acceptance: r.acceptance, priority: r.priority, category: r.category });
  const [busy, setBusy] = useState(false);
  const url = `/api/projects/${ctx.ws.project.id}/requirements/${r.id}`;

  const update = async (json: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api(url, { method: "PATCH", json });
      await ctx.reload();
      setEditing(false);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(url, { method: "DELETE" });
      await ctx.reload();
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(false);
    }
  };

  const suggested = r.status === "proposed";
  const priorityTone = r.priority === "must" ? "text-ink" : r.priority === "should" ? "text-ink-2" : "text-ink-3";

  if (editing)
    return (
      <li className="space-y-4 py-4">
        <Field label="Requirement">
          <textarea rows={2} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} className="field-input" autoFocus />
        </Field>
        <Field label="How to check it" hint="Observable and specific: what would you look at to say it's done?">
          <input value={draft.acceptance} onChange={(e) => setDraft({ ...draft, acceptance: e.target.value })} className="field-input text-sm" />
        </Field>
        <div className="flex flex-wrap items-end gap-6">
          <Field label="Priority">
            <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} className="field-input w-28 text-sm">
              {PRIORITIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="field-input w-40 text-sm">
              {CATEGORIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || draft.text.trim().length < 3} onClick={() => update({ ...draft, status: suggested ? "confirmed" : undefined })}>
              {busy ? <Spinner /> : null} {suggested ? "Save & accept" : "Save"}
            </button>
          </div>
        </div>
      </li>
    );

  return (
    <li className={`group flex flex-wrap items-start gap-x-3 gap-y-2 py-3 sm:flex-nowrap ${r.status === "rejected" ? "opacity-50" : ""}`}>
      <span className={`mt-0.5 w-11 shrink-0 font-mono text-[11px] uppercase ${priorityTone}`}>{r.priority}</span>
      <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
        <p className={`text-sm leading-relaxed ${r.status === "rejected" ? "line-through" : "text-ink"}`}>{r.text}</p>
        {r.acceptance ? <p className="mt-0.5 text-xs text-ink-3">Check: {r.acceptance}</p> : suggested || r.status === "rejected" ? null : <p className="mt-0.5 text-xs text-ink-3/70">No check defined yet.</p>}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="tag">{r.category}</span>
          {r.origin !== "explicit" || suggested ? (
            <span className={`tag ${r.origin !== "explicit" ? "suggested" : ""}`}>
              {r.origin !== "explicit" ? <Asterisk className="text-[9px] text-accent" /> : null}
              {ORIGIN_LABEL[r.origin] ?? r.origin}
            </span>
          ) : null}
        </div>
      </div>
      <div className="ml-14 flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:ml-0 md:opacity-60 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        {suggested ? (
          <>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => update({ status: "confirmed" })} aria-label={`Accept: ${r.text}`}>
              <Check className="h-3.5 w-3.5" /> Accept
            </button>
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => update({ status: "rejected" })} aria-label={`Reject: ${r.text}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : r.status === "rejected" ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => update({ status: "confirmed" })}>
            Restore
          </button>
        ) : null}
        {r.status !== "rejected" ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(true)} aria-label={`Edit: ${r.text}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {!suggested ? (
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={remove} aria-label={`Delete: ${r.text}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function AddRequirement({ ctx }: { ctx: Ctx }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [priority, setPriority] = useState("should");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  const guess = useMemo(() => guessCategory(text), [text]);

  if (!open)
    return (
      <button type="button" className="btn btn-quiet mt-3" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add requirement
      </button>
    );

  return (
    <form
      className="mt-4 space-y-4 rounded-lg border border-line p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(`/api/projects/${ctx.ws.project.id}/requirements`, { method: "POST", json: { text, acceptance, priority, category: category === "other" ? guess : category } });
          setText("");
          setAcceptance("");
          await ctx.reload();
        } catch (err) {
          toast((err as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Requirement">
        <input value={text} onChange={(e) => setText(e.target.value)} required minLength={3} maxLength={500} className="field-input" placeholder="e.g. The contact form sends to my email" autoFocus />
      </Field>
      <Field label="How to check it (optional)">
        <input value={acceptance} onChange={(e) => setAcceptance(e.target.value)} maxLength={500} className="field-input text-sm" placeholder="e.g. Submitting the form shows a confirmation" />
      </Field>
      <div className="flex flex-wrap items-end gap-6">
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="field-input w-28 text-sm">
            {PRIORITIES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="field-input w-40 text-sm">
            {CATEGORIES.map((x) => (
              <option key={x} value={x}>
                {x === "other" && guess !== "other" ? `auto (${guess})` : x}
              </option>
            ))}
          </select>
        </Field>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>
            Done
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? <Spinner /> : <Plus className="h-3.5 w-3.5" />} Add
          </button>
        </div>
      </div>
    </form>
  );
}

function guessCategory(s: string) {
  const l = s.toLowerCase();
  if (/\b(don'?t|do not|avoid|never|no )/.test(l)) return "exclusion";
  if (/\b(mobile|responsive|tablet)/.test(l)) return "responsive";
  if (/\b(contrast|keyboard|alt|screen reader|accessib)/.test(l)) return "accessibility";
  if (/\b(fast|load|performance)/.test(l)) return "performance";
  if (/\b(colou?r|font|style|look|dark|light|animation)/.test(l)) return "visual";
  if (/\b(form|button|login|search|nav|menu|click)/.test(l)) return "functionality";
  if (/\b(section|page|copy|text|about|contact)/.test(l)) return "content";
  return "other";
}

