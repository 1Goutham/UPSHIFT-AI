"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, Empty, Field, Spinner, useToast } from "./ui";

type M = { id: string; kind: string; content: string; source: string };
const KINDS = [
  { id: "preference", label: "Preference", hint: "e.g. Dark themes with one accent colour; no stock photography" },
  { id: "tool", label: "Tool", hint: "e.g. I build sites in Lovable and fix them in Cursor" },
  { id: "pattern", label: "Prompt pattern", hint: "e.g. Always end with a 'Done when' checklist" },
  { id: "context", label: "Context", hint: "e.g. My brand colours are #000 and #9DFF50" },
];

export function MemoryEditor({ initial }: { initial: M[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [kind, setKind] = useState("preference");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { memory } = await api<{ memory: M }>("/api/memory", { method: "POST", json: { kind, content } });
      setItems((xs) => [memory, ...xs]);
      setContent("");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const save = async (m: M, next: string) => {
    if (next.trim() === m.content) return;
    try {
      await api(`/api/memory/${m.id}`, { method: "PATCH", json: { content: next } });
      setItems((xs) => xs.map((x) => (x.id === m.id ? { ...x, content: next.trim() } : x)));
      toast("Saved.");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const remove = async (m: M) => {
    try {
      await api(`/api/memory/${m.id}`, { method: "DELETE" });
      setItems((xs) => xs.filter((x) => x.id !== m.id));
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={add} className="flex flex-wrap items-end gap-4 rounded-lg border border-line p-4">
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="field-input w-40 text-sm">
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Remember" className="min-w-60 flex-1">
          <input value={content} onChange={(e) => setContent(e.target.value)} minLength={3} maxLength={1000} required className="field-input" placeholder={KINDS.find((k) => k.id === kind)?.hint} />
        </Field>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? <Spinner /> : <Plus className="h-3.5 w-3.5" />} Add
        </button>
      </form>
      {items.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((m) => (
            <li key={m.id} className="flex items-start gap-3 py-3">
              <span className="tag mt-1.5 w-28 justify-center">{KINDS.find((k) => k.id === m.kind)?.label ?? m.kind}</span>
              <label className="field min-w-0 flex-1">
                <span className="sr-only">Memory content</span>
                <input defaultValue={m.content} onBlur={(e) => save(m, e.target.value)} className="field-input border-transparent text-sm" />
                <span className="field-line" aria-hidden />
              </label>
              <button type="button" className="btn btn-quiet btn-sm" aria-label="Delete" onClick={() => remove(m)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Nothing remembered">Add preferences you want applied to every prompt rewrite.</Empty>
      )}
    </div>
  );
}
