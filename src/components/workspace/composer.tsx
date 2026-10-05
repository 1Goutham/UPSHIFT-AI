"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { api, Spinner, useToast } from "../ui";
import { Dictate } from "../dictate";
import type { Ctx } from "./types";

type Mode = "requirement" | "refine";

/**
 * Conversational input. Every mode maps to an explicit, visible change in the
 * project (a new requirement, a new prompt version); nothing is hidden behind
 * a chat transcript.
 */
export function Composer({ ctx }: { ctx: Ctx }) {
  const { ws, provider, reload, setTab } = ctx;
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("requirement");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const target = ws.prompts.find((p) => p.kind === "optimized" || p.kind === "refined");
  const refineDisabled = !provider.configured || !target;

  const submit = async () => {
    const value = text.trim();
    if (value.length < 3) return;
    setBusy(true);
    try {
      if (mode === "requirement") {
        await api(`/api/projects/${ws.project.id}/requirements`, { method: "POST", json: { text: value } });
        toast("Requirement added and confirmed in the Brief checklist.");
      } else {
        await api(`/api/projects/${ws.project.id}/prompts/${target!.id}/refine`, { method: "POST", json: { instruction: value } });
        toast("Prompt refined. Saved as a new version.");
        setTab("prompt");
      }
      setText("");
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const placeholder =
    mode === "requirement" ? "Add a requirement" : refineDisabled ? (provider.configured ? "Improve the prompt first" : "Needs a model") : "How should the prompt change?";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 md:left-56 lg:pr-0">
      <div className="pointer-events-auto mx-auto max-w-3xl px-4 pb-4">
        <div className="rounded-xl border border-line-strong bg-raise/95 p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur">
          <div className="flex gap-1 px-1 pb-1.5">
            {(
              [
                ["requirement", "Add requirement"],
                ["refine", "Refine prompt"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id} className={`rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${mode === id ? "bg-bg text-ink" : "text-ink-3 hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-1.5">
            <textarea
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              disabled={busy || (mode === "refine" && refineDisabled)}
              placeholder={placeholder}
              aria-label={mode === "requirement" ? "New requirement" : "Prompt refinement instruction"}
              maxLength={2000}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-ink-3"
            />
            <Dictate onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} />
            <button type="button" onClick={submit} disabled={busy || text.trim().length < 3 || (mode === "refine" && refineDisabled)} className="btn btn-primary h-9 w-9 p-0" aria-label="Send">
              {busy ? <Spinner /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
