"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { STATUS_HELP, STATUS_LABEL, type FindingStatus } from "@/lib/engines/taxonomy";

/* ------------------------------------------------------------------ */
/*  Marks                                                              */
/* ------------------------------------------------------------------ */

/** The portfolio's asterisk, drawn so it renders the same everywhere. Marks AI suggestions. */
export function Asterisk({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7" />
    </svg>
  );
}

export function Bracket({ children, as: Tag = "span", className = "" }: { children: ReactNode; as?: "span" | "h1" | "h2" | "h3"; className?: string }) {
  return (
    <Tag className={`bracket ${className}`}>
      <span className="bracket-l" aria-hidden="true">[</span>
      <span className="bracket-t">{children}</span>
      <span className="bracket-r" aria-hidden="true">]</span>
    </Tag>
  );
}

/**
 * Status mark. Shape carries meaning so colour is never the only signal:
 * filled = verified, ring = model judgement, diamond = subjective,
 * dashed = not tested / unable.
 */
export function StatusMark({ status, method, withLabel = false }: { status: string; method?: string; withLabel?: boolean }) {
  const s = status as FindingStatus;
  const base = "inline-block h-2.5 w-2.5 shrink-0";
  let mark: ReactNode;
  switch (s) {
    case "verified_pass":
      mark = <span className={`${base} rounded-full bg-pass`} />;
      break;
    case "verified_fail":
      mark = <span className={`${base} rounded-full bg-fail`} />;
      break;
    case "likely_pass":
      mark = <span className={`${base} rounded-full border-[1.5px] border-pass`} />;
      break;
    case "likely_issue":
      mark = <span className={`${base} rounded-full border-[1.5px] border-fail`} />;
      break;
    case "subjective":
      mark = <span className={`${base} rotate-45 scale-75 border-[1.5px] border-ink-2`} />;
      break;
    default:
      mark = <span className={`${base} rounded-full border border-dashed border-ink-3`} />;
  }
  const label = method === "human" && (s === "verified_pass" || s === "verified_fail") ? (s === "verified_pass" ? "Met (your review)" : "Not met (your review)") : STATUS_LABEL[s] ?? status;
  return (
    <span className="inline-flex items-center gap-1.5" title={STATUS_HELP[s]}>
      {mark}
      {withLabel ? <span className="font-mono text-[11px] text-ink-2">{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

export function SeverityTag({ severity }: { severity: string }) {
  const tone = severity === "critical" || severity === "high" ? "text-fail" : severity === "medium" ? "text-warn" : "text-ink-3";
  return <span className={`font-mono text-[11px] uppercase tracking-wide ${tone}`}>{severity}</span>;
}

export function MethodTag({ method }: { method: string }) {
  const label: Record<string, string> = { deterministic: "check", browser: "browser", model: "model", human: "you" };
  return <span className="tag">{label[method] ?? method}</span>;
}

/* ------------------------------------------------------------------ */
/*  Inputs                                                             */
/* ------------------------------------------------------------------ */

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      <span className="field-line" aria-hidden="true" />
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Asterisk className={`spin-star text-accent ${className}`} />;
}

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          toast("Copy failed. Your browser blocked clipboard access; select the text and copy it manually.", "error");
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}

export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <Asterisk className="mx-auto mb-3 text-xl text-ink-3" />
      <p className="text-sm text-ink">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-ink-3">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-fail/40 bg-fail/5 px-3 py-2.5 text-sm text-ink-2">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-fail" aria-hidden />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirm dialog                                                     */
/* ------------------------------------------------------------------ */

export function Confirm({
  open,
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-lg border border-line bg-panel p-0 text-ink">
      <div className="p-5">
        <h2 className="text-base font-medium">{title}</h2>
        <div className="mt-2 text-sm text-ink-2">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Toasts: only for results of actions the user just took.            */
/* ------------------------------------------------------------------ */

type Toast = { id: number; text: string; tone: "info" | "error" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="rise-in pointer-events-auto flex items-start gap-3 rounded-md border border-line bg-raise px-3 py-2.5 text-sm text-ink shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)]">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.tone === "error" ? "bg-fail" : "bg-accent"}`} aria-hidden />
            <span className="flex-1">{t.text}</span>
            <button type="button" aria-label="Dismiss" className="text-ink-3 hover:text-ink" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  API helper                                                         */
/* ------------------------------------------------------------------ */

export class ClientApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "content-type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ClientApiError("Network error. Check your connection and retry.", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
    throw new ClientApiError(data?.error ?? `Request failed (${res.status}).`, res.status, data?.code);
  }
  return data as T;
}
