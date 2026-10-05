"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { CONTENT_TYPES } from "@/lib/engines/taxonomy";
import { api, ErrorNote, Field, Spinner } from "./ui";
import { Dictate } from "./dictate";
import { PendingReferences } from "./references";

export function NewProject({ startOpen, playbooks }: { startOpen: boolean; playbooks: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [goal, setGoal] = useState("");
  const [refs, setRefs] = useState<File[]>([]);

  if (!open)
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> New project
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
      <div className="grid gap-6 md:grid-cols-3">
        <Field label="Name" className="md:col-span-1">
          <input name="name" required maxLength={120} className="field-input" />
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
        <Field label="AI tool (optional)">
          <input name="targetTool" maxLength={80} className="field-input" placeholder="Lovable, v0, Cursor…" />
        </Field>
        <div className="md:col-span-3">
          <Field label="Goal">
            <div className="flex items-end gap-2">
              <textarea name="goal" rows={2} maxLength={4000} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should the AI help you make?" className="field-input" />
              <Dictate onText={(t) => setGoal((g) => (g ? `${g} ${t}` : t))} />
            </div>
          </Field>
        </div>
        <div className="md:col-span-3">
          <Field label="Your prompt (optional)">
            <textarea name="originalPrompt" rows={3} maxLength={20000} className="field-input font-mono text-[13px]" />
          </Field>
        </div>
        <div className="md:col-span-3">
          <p className="field-label">References (optional)</p>
          <PendingReferences files={refs} onChange={setRefs} />
        </div>
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
      {error ? (
        <div className="mt-5">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <div className="mt-6 flex justify-end">
        <button type="submit" disabled={busy} className="btn btn-primary group">
          {busy ? <Spinner /> : null} Create project <ArrowRight className="nudge-x h-4 w-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
