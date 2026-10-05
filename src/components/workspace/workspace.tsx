"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookmarkPlus, Download, Link2, Link2Off, MoreHorizontal, Trash2 } from "lucide-react";
import { CONTENT_TYPES } from "@/lib/engines/taxonomy";
import { api, Confirm, Spinner, useToast } from "../ui";
import { BriefTab } from "./brief-tab";
import { PromptTab } from "./prompt-tab";
import { OutputsTab } from "./outputs-tab";
import { CompareTab } from "./compare-tab";
import { HistoryTab } from "./history-tab";
import { NextStep } from "./next-step";
import { Composer } from "./composer";
import type { Ctx, Provider, Tab, WS } from "./types";

const TABS: { id: Tab; label: string; n?: string }[] = [
  { id: "brief", label: "Brief", n: "01" },
  { id: "prompt", label: "Prompt", n: "02" },
  { id: "outputs", label: "Outputs", n: "03" },
  { id: "compare", label: "Compare", n: "04" },
  { id: "history", label: "History" },
];

export function Workspace({ initial, provider }: { initial: WS; provider: Provider }) {
  const router = useRouter();
  const toast = useToast();
  const [ws, setWs] = useState<WS>(initial);
  const [tab, setTabState] = useState<Tab>("brief");
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTabState(t);
    else if (initial.artifacts.length) setTabState("outputs");
    else if (initial.requirements.some((r) => r.status === "confirmed")) setTabState("prompt");
  }, [initial]);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await api<WS>(`/api/projects/${initial.project.id}`);
      setWs(data);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }, [initial.project.id, toast]);

  // Audits run in the background; poll while any is still running.
  const running = ws.evaluations.some((e) => e.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 2500);
    return () => clearInterval(t);
  }, [running, reload]);

  const ctx: Ctx = { ws, provider, reload, setTab };

  const patchProject = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api(`/api/projects/${ws.project.id}`, { method: "PATCH", json: patch });
      await reload();
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const share = async (rotate: boolean) => {
    setMenu(false);
    try {
      const { path } = await api<{ path: string }>(`/api/projects/${ws.project.id}/share`, { method: "POST" });
      const link = `${window.location.origin}${path}`;
      await navigator.clipboard.writeText(link).then(
        () => toast(rotate ? "New link copied. The old one no longer works." : "Read-only link copied."),
        () => window.prompt("Copy this link", link),
      );
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const unshare = async () => {
    setMenu(false);
    try {
      await api(`/api/projects/${ws.project.id}/share`, { method: "DELETE" });
      toast("Link disabled.");
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  // Number keys switch stages when you're not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < TABS.length) setTab(TABS[i].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTab]);

  const savePlaybook = async () => {
    setMenu(false);
    const name = window.prompt("Name this playbook", ws.project.name);
    if (!name?.trim()) return;
    try {
      await api("/api/playbooks", { method: "POST", json: { projectId: ws.project.id, name: name.trim() } });
      toast(`Saved "${name.trim()}" with ${ws.requirements.filter((r) => r.status === "confirmed").length} confirmed requirements.`);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const counts = {
    brief: ws.requirements.filter((r) => r.status === "confirmed").length,
    proposed: ws.requirements.filter((r) => r.status === "proposed").length,
    outputs: ws.artifacts.length,
  };

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col md:min-h-dvh">
      {/* Header */}
      <header className="border-b border-line px-5 pt-5 md:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <EditableTitle value={ws.project.name} onSave={(name) => patchProject({ name })} />
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-3">
              <label className="inline-flex items-center gap-1.5">
                <span className="sr-only">Output type</span>
                <select
                  value={ws.project.contentType}
                  onChange={(e) => patchProject({ contentType: e.target.value })}
                  className="cursor-pointer bg-transparent text-ink-2 outline-none hover:text-ink"
                >
                  {CONTENT_TYPES.map((c) => (
                    <option key={c.id} value={c.id} className="bg-panel">
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <ToolInput value={ws.project.targetTool} onSave={(targetTool) => patchProject({ targetTool })} />
              {saving ? <Spinner /> : null}
            </div>
          </div>
          <div className="relative flex items-center gap-1">
            {ws.shared ? <span className="mr-1 font-mono text-[11px] text-accent" title="A read-only link is active">shared</span> : null}
            <a href={`/api/projects/${ws.project.id}/export`} className="btn btn-quiet btn-sm" title="Export project as Markdown">
              <Download className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Export</span>
            </a>
            <button type="button" className="btn btn-quiet btn-sm" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menu ? (
              <div className="rise-in absolute right-0 top-10 z-20 w-56 rounded-md border border-line bg-raise p-1 shadow-xl" onMouseLeave={() => setMenu(false)}>
                <button type="button" className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-ink-2 hover:bg-panel hover:text-ink" onClick={() => share(ws.shared)}>
                  <Link2 className="h-4 w-4" /> {ws.shared ? "New share link" : "Share report"}
                </button>
                {ws.shared ? (
                  <button type="button" className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-ink-2 hover:bg-panel hover:text-ink" onClick={unshare}>
                    <Link2Off className="h-4 w-4" /> Stop sharing
                  </button>
                ) : null}
                <button type="button" className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-ink-2 hover:bg-panel hover:text-ink" onClick={savePlaybook}>
                  <BookmarkPlus className="h-4 w-4" /> Save as playbook
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-fail hover:bg-panel"
                  onClick={() => {
                    setMenu(false);
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete project
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <Tabs tab={tab} setTab={setTab} counts={counts} />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-5 py-6 pb-36 md:px-8">
          <NextStep ctx={ctx} />
          {tab === "brief" ? <BriefTab ctx={ctx} /> : null}
          {tab === "prompt" ? <PromptTab ctx={ctx} /> : null}
          {tab === "outputs" ? <OutputsTab ctx={ctx} /> : null}
          {tab === "compare" ? <CompareTab ctx={ctx} /> : null}
          {tab === "history" ? <HistoryTab ctx={ctx} /> : null}
        </main>
      </div>

      <Composer ctx={ctx} />

      <Confirm
        open={confirmDelete}
        title="Delete this project?"
        body={
          <>
            <strong className="text-ink">{ws.project.name}</strong> and everything in it will be permanently deleted.
          </>
        }
        confirmLabel="Delete project"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await api(`/api/projects/${ws.project.id}`, { method: "DELETE" });
            router.replace("/app");
            router.refresh();
          } catch (err) {
            toast((err as Error).message, "error");
            setConfirmDelete(false);
          }
        }}
      />
    </div>
  );
}

function Tabs({ tab, setTab, counts }: { tab: Tab; setTab: (t: Tab) => void; counts: { brief: number; proposed: number; outputs: number } }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`);
    if (el) setLine({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);
  const badge: Partial<Record<Tab, string>> = {
    brief: counts.proposed ? `${counts.proposed} new` : counts.brief ? String(counts.brief) : "",
    outputs: counts.outputs ? `v${counts.outputs}` : "",
  };
  return (
    <div ref={listRef} role="tablist" aria-label="Workspace stages" className="relative -mb-px mt-5 flex gap-1 overflow-x-auto">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={tab === t.id}
          onClick={() => setTab(t.id)}
          className={`flex h-10 shrink-0 items-center gap-2 px-3 text-[13px] transition-colors ${tab === t.id ? "text-ink" : "text-ink-3 hover:text-ink"}`}
        >
          {t.n ? <span className="font-mono text-[10px] text-ink-3">{t.n}</span> : null}
          {t.label}
          {badge[t.id] ? <span className={`font-mono text-[10px] ${t.id === "brief" && counts.proposed ? "text-accent" : "text-ink-3"}`}>{badge[t.id]}</span> : null}
        </button>
      ))}
      <span className="tabs-line pointer-events-none absolute bottom-0 h-px bg-ink" style={{ left: line.left, width: line.width }} aria-hidden />
    </div>
  );
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="field block max-w-xl">
      <span className="sr-only">Project name</span>
      <input
        value={v}
        maxLength={120}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() && v.trim() !== value && onSave(v.trim())}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-full truncate border-0 bg-transparent p-0 font-mono text-xl text-ink outline-none md:text-2xl"
      />
      <span className="field-line" aria-hidden />
    </label>
  );
}

function ToolInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="field inline-block">
      <input
        value={v}
        placeholder="Target AI tool (optional)"
        aria-label="Target AI tool"
        maxLength={80}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() !== value && onSave(v.trim())}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-48 border-0 bg-transparent p-0 text-xs text-ink-2 outline-none placeholder:text-ink-3"
      />
      <span className="field-line" aria-hidden />
    </label>
  );
}
