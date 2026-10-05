"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { api, Spinner } from "./ui";

/** Paste a URL, get an audit. No account needed. */
export function QuickAudit({ autoFocus = false, compact = false }: { autoFocus?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      onSubmit={async (e) => {
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
      }}
      className="w-full max-w-xl"
    >
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
