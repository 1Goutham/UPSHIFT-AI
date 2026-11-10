"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { wordDiff } from "@/lib/refine/intent-check";
import { PLATFORMS, platformLabel } from "@/lib/refine/platforms";
import { compressLocal, type PreserveCheck } from "@/lib/tokens/compress";
import { estimateTokens, formatTokens } from "@/lib/tokens/estimate";
import type { TokenStats } from "@/lib/tokens/service";
import { api, CopyButton, ErrorNote, Spinner } from "./ui";

type Result = { text: string; before: number; after: number; saved: number; ratio: number; check: PreserveCheck; cut?: string[]; method: "local" | "ai"; note?: string };

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** Compress a prompt (locally first, then optionally with a model) and see this month's token workload. */
export function TokenLab({ modelReady }: { modelReady: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("chatgpt");
  const [result, setResult] = useState<Result | null>(null);
  const [view, setView] = useState<"after" | "diff">("after");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<TokenStats | null>(null);

  const tokens = useMemo(() => estimateTokens(prompt), [prompt]);
  const loadStats = useCallback(() => {
    api<TokenStats>("/api/tokens/stats")
      .then(setStats)
      .catch(() => {});
  }, []);
  useEffect(loadStats, [loadStats]);

  const compress = () => {
    setError("");
    const c = compressLocal(prompt);
    setResult({ ...c, method: "local" });
    setView("after");
    // Counts only, never the text.
    if (c.saved > 0) api("/api/tokens/events", { method: "POST", json: { method: "compress-local", platform, source: "web", before: c.before, after: c.after } }).then(loadStats, () => {});
  };

  const compressMore = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<Omit<Result, "method"> & { by: "ai" | "local" | "none" }>("/api/tokens/compress", { method: "POST", json: { prompt, platform, source: "web" } });
      setResult({ ...r, method: r.by === "ai" ? "ai" : "local", note: r.by === "ai" ? undefined : "AI couldn't make it shorter without losing something." });
      setView("after");
      loadStats();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lost = result?.check.issues.filter((i) => i.kind !== "term") ?? [];
  const reworded = result?.check.issues.filter((i) => i.kind === "term") ?? [];

  return (
    <div className="space-y-14">
      <section className="space-y-4" aria-label="Compress">
        <div className="inline-flex flex-wrap rounded-md bg-raise p-0.5" role="radiogroup" aria-label="AI tool">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={platform === p.id}
              onClick={() => setPlatform(p.id)}
              className={`h-8 rounded px-3 text-xs ${platform === p.id ? "bg-bg text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-ink-3 hover:text-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setResult(null);
            }}
            aria-label="Prompt"
            rows={7}
            placeholder="Paste a prompt"
            className="w-full resize-y rounded-lg border border-line bg-panel p-4 pb-9 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-line-strong"
          />
          <span className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs text-ink-3" aria-live="polite">
            ≈ {formatTokens(tokens)} tokens
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={compress} disabled={!prompt.trim()}>
            Compress
          </button>
          {modelReady ? (
            <button type="button" className="btn btn-ghost" onClick={compressMore} disabled={busy || !prompt.trim()}>
              {busy ? <Spinner /> : null} Compress more
            </button>
          ) : null}
        </div>
        {error ? <ErrorNote message={error} onRetry={compressMore} /> : null}

        {result ? (
          <div className="rise-in space-y-3" aria-label="Result">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-2xl font-light">
                {result.saved > 0 ? (
                  <>
                    <span className="font-semibold">{pct(result.ratio)}</span> fewer tokens
                  </>
                ) : (
                  "Already lean"
                )}
              </p>
              <p className="font-mono text-xs text-ink-3">
                ≈ {formatTokens(result.before)} to {formatTokens(result.after)} tokens{result.method === "ai" ? ", with AI" : ""}
              </p>
              <p className={`text-sm ${result.check.ok ? "text-pass" : lost.length ? "text-fail" : "text-warn"}`} role="status">
                {result.check.ok ? "Nothing lost" : lost.length ? "Something was lost" : "Reworded"}
              </p>
            </div>
            {lost.length ? <p className="text-sm text-fail">Missing: {lost.map((i) => (i.kind === "negation" ? "a negation (don't, never, without)" : i.value)).join(", ")}</p> : null}
            {reworded.length ? <p className="text-sm text-warn">No longer says: {reworded.map((i) => i.value).join(", ")}</p> : null}

            <div className="flex items-center gap-4 text-xs" role="tablist">
              {(["after", "diff"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={view === v ? "text-ink" : "text-ink-3 hover:text-ink"}>
                  {v === "after" ? "Compressed" : "Changes"}
                </button>
              ))}
              <span className="ml-auto">
                <CopyButton text={result.text} />
              </span>
            </div>
            <div className="prompt-out max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-panel p-4 text-sm text-ink-2">
              {view === "after"
                ? result.text
                : wordDiff(prompt, result.text).map((p, i) =>
                    p.type === "same" ? (
                      <span key={i}>{p.text}</span>
                    ) : (
                      <span key={i} className={p.type === "del" ? "text-fail line-through opacity-70" : "rounded-sm bg-accent/15 text-ink"}>
                        {p.text}
                      </span>
                    ),
                  )}
            </div>
            {result.cut?.length ? <p className="text-xs text-ink-3">Removed: {result.cut.join(", ")}</p> : null}
            {result.note ? <p className="text-xs text-ink-3">{result.note}</p> : null}
          </div>
        ) : null}
      </section>

      <Workload stats={stats} />
    </div>
  );
}

function Workload({ stats }: { stats: TokenStats | null }) {
  if (!stats) return null;
  const m = stats.month;
  const max = Math.max(1, ...stats.days.map((d) => d.saved));
  const cards: [string, string][] = [
    ["Saved this month", `≈ ${formatTokens(m.saved)}`],
    ["Compressions", String(m.compressed)],
    ["Average saving", m.before ? pct(m.saved / m.before) : "0%"],
    ["Added by refining", m.refineAdded > 0 ? `≈ ${formatTokens(m.refineAdded)}` : "0"],
  ];
  return (
    <section aria-label="Workload" className="space-y-6">
      <h2 className="font-mono text-lg">
        <span className="text-ink-3">[</span> Workload <span className="text-ink-3">]</span>
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        {cards.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-ink-3">{k}</dt>
            <dd className="mt-1 text-2xl font-light">{v}</dd>
          </div>
        ))}
      </dl>

      <figure aria-label="Tokens saved per day, last 30 days">
        <div className="flex h-24 items-end gap-[3px]">
          {stats.days.map((d) => (
            <div key={d.day} className="group relative flex-1" style={{ height: "100%" }}>
              <div className={`absolute inset-x-0 bottom-0 rounded-sm ${d.saved ? "bg-ink" : "bg-line"}`} style={{ height: d.saved ? `${Math.max(4, (d.saved / max) * 100)}%` : "2px" }} />
              <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-ink-2 group-hover:block">
                {d.day.slice(5)}: {formatTokens(d.saved)}
              </span>
            </div>
          ))}
        </div>
        <figcaption className="mt-2 flex justify-between font-mono text-[10px] text-ink-3">
          <span>30 days ago</span>
          <span>Today</span>
        </figcaption>
      </figure>

      {stats.platforms.length ? (
        <ul className="divide-y divide-line text-sm">
          {stats.platforms.map((p) => (
            <li key={p.platform} className="flex justify-between py-2">
              <span className="text-ink-2">{platformLabel(p.platform)}</span>
              <span className="font-mono text-xs text-ink-3">
                ≈ {formatTokens(p.saved)} saved, {p.count} {p.count === 1 ? "prompt" : "prompts"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-ink-3">
        Counts are estimates for the prompts you send to your AI tools. Upshift&apos;s own model use this month: {formatTokens(stats.upshift.input)} in, {formatTokens(stats.upshift.output)} out, across {stats.upshift.calls} {stats.upshift.calls === 1 ? "call" : "calls"}.
      </p>
    </section>
  );
}
