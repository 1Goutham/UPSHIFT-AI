"use client";

import { CopyButton } from "./ui";

/** A prompt that may be split into several messages: one block and copy button per message. */
export function PromptParts({ content, parts }: { content: string; parts?: string[] }) {
  const list = parts?.length ? parts : [content];
  return (
    <div className="space-y-3">
      {list.map((p, i) => (
        <div key={i} className="rounded-md border border-line bg-bg">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="font-mono text-[11px] text-ink-3">{list.length > 1 ? `Message ${i + 1} of ${list.length}` : "Prompt"}</span>
            <CopyButton text={p} label="Copy" />
          </div>
          <pre className="prompt-out max-h-80 overflow-auto p-4">{p}</pre>
        </div>
      ))}
    </div>
  );
}
