"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { api, Spinner, useToast } from "./ui";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const MAX_REFERENCES = 6;

type Ref = { id: string; storageKey: string; label: string };

/** Pull image files out of a paste or drop. */
export function imagesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files ?? []).filter((f) => f.type.startsWith("image/"));
}

/** Reference images for a saved project: drop, paste or pick; uploads immediately. */
export function References({ projectId, items, onChange }: { projectId: string; items: Ref[]; onChange: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(true);
      try {
        const fd = new FormData();
        for (const f of files.slice(0, MAX_REFERENCES - items.length)) fd.append("file", f);
        await api(`/api/projects/${projectId}/references`, { method: "POST", body: fd });
        await onChange();
      } catch (err) {
        toast((err as Error).message, "error");
      } finally {
        setBusy(false);
      }
    },
    [projectId, items.length, onChange, toast],
  );

  // Paste an image anywhere on the page (outside text fields) to add it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const files = imagesFrom(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        upload(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  const remove = async (id: string) => {
    try {
      await api(`/api/projects/${projectId}/references/${id}`, { method: "DELETE" });
      await onChange();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        upload(imagesFrom(e.dataTransfer));
      }}
      className={`flex flex-wrap gap-2 rounded-lg transition-colors ${drag ? "bg-accent/5 outline outline-1 outline-accent" : ""}`}
    >
      {items.map((r) => (
        <figure key={r.id} className="group relative h-20 w-20 overflow-hidden rounded-md border border-line bg-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/projects/${projectId}/files/${r.storageKey}`} alt={r.label || "Reference image"} className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => remove(r.id)}
            aria-label={`Remove ${r.label || "reference"}`}
            className="absolute right-1 top-1 rounded bg-bg/80 p-0.5 text-ink opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </figure>
      ))}
      {items.length < MAX_REFERENCES ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          title="Add images: pick, drop or paste"
          aria-label="Add reference images"
          className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-line-strong text-ink-3 transition-colors hover:border-ink-2 hover:text-ink"
        >
          {busy ? <Spinner /> : <ImagePlus className="h-5 w-5" />}
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => {
          upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Reference images picked before a project exists; uploaded after creation. */
export function PendingReferences({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);
  const add = (more: File[]) => onChange([...files, ...more.filter((f) => f.type.startsWith("image/"))].slice(0, MAX_REFERENCES));
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(imagesFrom(e.dataTransfer));
      }}
      onPaste={(e) => add(imagesFrom(e.clipboardData))}
      className="flex flex-wrap gap-2"
    >
      {urls.map((u, i) => (
        <figure key={u} className="group relative h-16 w-16 overflow-hidden rounded-md border border-line bg-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt={files[i]?.name ?? ""} className="h-full w-full object-cover" />
          <button type="button" aria-label="Remove" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded bg-bg/80 p-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
            <X className="h-3 w-3" />
          </button>
        </figure>
      ))}
      {files.length < MAX_REFERENCES ? (
        <button type="button" onClick={() => input.current?.click()} aria-label="Add reference images" className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-line-strong text-ink-3 hover:border-ink-2 hover:text-ink">
          <ImagePlus className="h-4 w-4" />
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
