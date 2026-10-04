"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Play, Trash2 } from "lucide-react";
import { api, Confirm, Empty, useToast } from "./ui";

type PB = { id: string; name: string; contentType: string; targetTool: string; requirements: { text: string; priority: string; category: string }[]; promptTemplate: string; createdAt: string };

export function PlaybookList({ playbooks }: { playbooks: PB[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [del, setDel] = useState<PB | null>(null);

  if (!playbooks.length) return <Empty title="No playbooks yet">Open a project that went well and choose “Save as playbook” from its ··· menu.</Empty>;

  const start = async (pb: PB) => {
    try {
      const { project } = await api<{ project: { id: string } }>("/api/projects", { method: "POST", json: { name: `${pb.name} (new)`, playbookId: pb.id } });
      router.push(`/app/p/${project.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {playbooks.map((pb) => (
          <li key={pb.id} className="py-3">
            <div className="flex items-center gap-3">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === pb.id ? null : pb.id)} aria-expanded={open === pb.id}>
                <ChevronRight className={`h-4 w-4 shrink-0 text-ink-3 transition-transform ${open === pb.id ? "rotate-90" : ""}`} />
                <span className="truncate text-[15px] text-ink">{pb.name}</span>
                <span className="tag">{pb.contentType}</span>
                <span className="font-mono text-[11px] text-ink-3">{pb.requirements.length} req</span>
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => start(pb)}>
                <Play className="h-3.5 w-3.5" /> Use
              </button>
              <button type="button" className="btn btn-quiet btn-sm" aria-label={`Delete ${pb.name}`} onClick={() => setDel(pb)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {open === pb.id ? (
              <div className="ml-6 mt-3 space-y-3">
                <ul className="space-y-1 text-sm">
                  {pb.requirements.map((r, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-12 shrink-0 font-mono text-[11px] uppercase text-ink-3">{r.priority}</span>
                      <span className="text-ink-2">{r.text}</span>
                    </li>
                  ))}
                </ul>
                {pb.promptTemplate ? <pre className="prompt-out max-h-60 overflow-auto rounded-md border border-line bg-panel p-3">{pb.promptTemplate}</pre> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Confirm
        open={!!del}
        title="Delete playbook?"
        body={<>Projects created from &ldquo;{del?.name}&rdquo; are not affected.</>}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          await api(`/api/playbooks/${del!.id}`, { method: "DELETE" }).catch((e) => toast(e.message, "error"));
          setDel(null);
          router.refresh();
        }}
      />
    </>
  );
}
