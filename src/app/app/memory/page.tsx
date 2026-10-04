import { currentUser } from "@/lib/auth/session";
import { listMemories } from "@/lib/repo/memory";
import { MemoryEditor } from "@/components/memory-editor";

export const metadata = { title: "Memory" };

export default async function MemoryPage() {
  const user = (await currentUser())!;
  const memories = await listMemories(user.id);
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-10">
      <h1 className="font-mono text-2xl">
        <span className="text-ink-3">[</span> Memory <span className="text-ink-3">]</span>
      </h1>
      <p className="mt-1 max-w-xl text-sm text-ink-3">
        Preferences UPSHIFT applies when it rewrites prompts with a model. Only what you write here is stored. Nothing is inferred from your activity, and you can edit or delete any of it.
      </p>
      <div className="mt-8">
        <MemoryEditor initial={memories.map((m) => ({ id: m.id, kind: m.kind, content: m.content, source: m.source }))} />
      </div>
    </main>
  );
}
