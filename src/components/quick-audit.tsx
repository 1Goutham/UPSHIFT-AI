"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { api, Spinner } from "./ui";

function useQuickAudit() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { projectId } = await api<{ projectId: string }>("/api/quick-audit", { method: "POST", json: { url } });
      router.push(`/app/p/${projectId}?tab=outputs`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return { url, setUrl, busy, error, submit };
}

/** Landing-page form: a labelled underline field and an outlined pill. */
export function QuickAuditLine() {
  const { url, setUrl, busy, error, submit } = useQuickAudit();
  return (
    <form
      onSubmit={(e) => {
        // Empty field: point at it rather than showing a disabled button.
        if (!url.trim()) {
          e.preventDefault();
          return document.getElementById("audit-url")?.focus();
        }
        submit(e);
      }}
      className="flex w-full flex-col gap-2 sm:w-auto"
    >
      <label htmlFor="audit-url" className="text-[clamp(0.75rem,0.75vw,1rem)] font-medium text-ink-2">
        Already built a site with AI?
      </label>
      <div className="flex items-end gap-4">
        <input
          id="audit-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          autoComplete="url"
          placeholder="your-site.lovable.app..."
          className="h-[clamp(3rem,3vw,4rem)] min-w-0 flex-1 border-0 border-b border-ink-2 bg-transparent text-[clamp(1.1rem,1.4vw,1.9rem)] font-light text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink sm:w-[clamp(16rem,18vw,26rem)] sm:flex-none"
        />
        <button type="submit" disabled={busy} className="pill pill-outline group">
          {busy ? <Spinner /> : null} Audit <ArrowUpRight className="nudge h-5 w-5" aria-hidden />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-fail">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** Paste a URL, get an audit. No account needed. */
export function QuickAudit({ autoFocus = false, compact = false }: { autoFocus?: boolean; compact?: boolean }) {
  const { url, setUrl, busy, error, submit } = useQuickAudit();

  return (
    <form onSubmit={submit} className="w-full max-w-xl">
      <div className={`flex items-center gap-2 rounded-xl border border-line-strong bg-panel p-1.5 transition-colors focus-within:border-ink-2 ${compact ? "" : "md:p-2"}`}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          autoComplete="url"
          autoFocus={autoFocus}
          aria-label="Website URL"
          placeholder="your-site.lovable.app"
          className={`min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-ink-3 ${compact ? "h-9 text-sm" : "h-11 text-base"}`}
        />
        <button type="submit" disabled={busy || !url.trim()} className={`btn btn-accent group ${compact ? "" : "h-11 px-5 text-sm"}`}>
          {busy ? <Spinner /> : null} Audit <ArrowRight className="nudge-x h-4 w-4" aria-hidden />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-fail">
          {error}
        </p>
      ) : null}
    </form>
  );
}
