"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { CONTENT_TYPES } from "@/lib/engines/taxonomy";
import { api, ErrorNote, Field, Spinner } from "./ui";
import { Dictate } from "./dictate";
import { PendingReferences } from "./references";
import { BuilderOptions } from "./builder-options";

export function NewProject({ startOpen, playbooks }: { startOpen: boolean; playbooks: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [goal, setGoal] = useState("");
  const [refs, setRefs] = useState<File[]>([]);

  if (!open)
    return (
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> Start from a brief, prompt or image instead
      </button>
    );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { project } = await api<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        json: {
          name: f.get("name"),
          goal,
          contentType: f.get("contentType"),
          targetTool: f.get("targetTool"),
          originalPrompt: f.get("originalPrompt"),
          playbookId: f.get("playbookId") || undefined,
        },
      });
      if (refs.length) {
        const fd = new FormData();
        for (const f of refs) fd.append("file", f);
        // The project exists either way; a failed image upload can be retried in the Brief.
        await api(`/api/projects/${project.id}/references`, { method: "POST", body: fd }).catch(() => {});
      }
      router.push(`/app/p/${project.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rise-in rounded-lg border border-line bg-panel p-5 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-medium">New project</h2>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="space-y-6">
        <label className="field block">
          <span className="sr-only">Goal</span>
          <div className="flex items-end gap-2">
            <textarea
              name="goal"
              aria-label="Goal"
              rows={2}
              maxLength={4000}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should the AI make?"
              className="field-input text-lg"
              autoFocus
            />
            <Dictate onText={(t) => setGoal((g) => (g ? `${g} ${t}` : t))} />
          </div>
          <span className="field-line" aria-hidden="true" />
        </label>
        <Field label="Your prompt (optional)">
          <textarea name="originalPrompt" rows={2} maxLength={20000} className="field-input font-mono text-[13px]" />
        </Field>
        <div>
          <p className="field-label">References (optional)</p>
          <PendingReferences files={refs} onChange={setRefs} />
        </div>
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-ink-3 hover:text-ink">
            <span className="group-open:hidden">More options</span>
            <span className="hidden group-open:inline">Fewer options</span>
          </summary>
          <div className="mt-5 grid gap-6 md:grid-cols-3">
            <Field label="Name">
              <input name="name" maxLength={120} className="field-input" placeholder="From the goal" />
            </Field>
            <Field label="Type">
              <select name="contentType" defaultValue="website" className="field-input">
                {CONTENT_TYPES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="AI tool">
              <input name="targetTool" maxLength={80} className="field-input" placeholder="Lovable, v0, Cursor…" list="builders" />
              <BuilderOptions />
            </Field>
            {playbooks.length ? (
              <Field label="Playbook">
                <select name="playbookId" defaultValue="" className="field-input">
                  <option value="">None</option>
                  {playbooks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
        </details>
      </div>
      {error ? (
        <div className="mt-5">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <div className="mt-6 flex justify-end">
        <button type="submit" disabled={busy || (!goal.trim() && !playbooks.length)} className="btn btn-primary group">
          {busy ? <Spinner /> : null} Start <ArrowRight className="nudge-x h-4 w-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
