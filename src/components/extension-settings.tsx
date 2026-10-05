"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { api, CopyButton, Spinner, useToast } from "./ui";

type Tok = { id: string; label: string; lastUsedAt: string | null; createdAt: string };

/** Connect the browser extension: install, then paste a one-time token. */
export function ExtensionSettings() {
  const toast = useToast();
  const [tokens, setTokens] = useState<Tok[] | null>(null);
  const [fresh, setFresh] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTokens((await api<{ tokens: Tok[] }>("/api/ext/tokens")).tokens);
    } catch (err) {
      toast((err as Error).message, "error");
      setTokens([]);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>("/api/ext/tokens", { method: "POST", json: { label: navigator.userAgent.includes("Edg/") ? "Edge" : "Chrome" } });
      setFresh(token);
      await load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    await api(`/api/ext/tokens/${id}`, { method: "DELETE" }).catch((e) => toast(e.message, "error"));
    await load();
  };

  return (
    <div className="space-y-6">
      <ol className="space-y-2 text-sm text-ink-2">
        <li className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-3">1</span>
          <a href="/upshift-extension.zip" download className="btn btn-ghost btn-sm">
            <Download className="h-3.5 w-3.5" /> Download extension
          </a>
          <span className="text-ink-3">unzip it</span>
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-xs text-ink-3">2</span>
          <span>
            Open <code className="font-mono text-ink">chrome://extensions</code>, turn on Developer mode, Load unpacked → the folder.
          </span>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-3">3</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={create} disabled={busy}>
            {busy ? <Spinner /> : <Plus className="h-3.5 w-3.5" />} Create token
          </button>
          <span className="text-ink-3">and paste it in the extension</span>
        </li>
      </ol>

      {fresh ? (
        <div className="rise-in rounded-md border border-accent/40 bg-panel p-3">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{fresh}</code>
            <CopyButton text={fresh} label="Copy" />
          </div>
          <p className="mt-2 text-xs text-ink-3">Shown once. Server: {typeof window !== "undefined" ? window.location.origin : ""}</p>
        </div>
      ) : null}

      {tokens === null ? (
        <Spinner />
      ) : tokens.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-ink-2">{t.label}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">{t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "never used"}</span>
              <button type="button" className="btn btn-quiet btn-sm" aria-label={`Revoke ${t.label} token`} onClick={() => revoke(t.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
