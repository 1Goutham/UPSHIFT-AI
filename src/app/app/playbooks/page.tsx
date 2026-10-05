import { desc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PlaybookList } from "@/components/playbook-list";

export const metadata = { title: "Playbooks" };

export default async function PlaybooksPage() {
  const user = (await currentUser())!;
  const db = await getDb();
  const playbooks = await db.select().from(schema.playbooks).where(eq(schema.playbooks.userId, user.id)).orderBy(desc(schema.playbooks.createdAt));
  return (
    <main className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-10">
      <h1 className="font-mono text-2xl">
        <span className="text-ink-3">[</span> Playbooks <span className="text-ink-3">]</span>
      </h1>
      <p className="mt-1 text-sm text-ink-3">Saved requirement sets. Save one from a project&apos;s ··· menu.</p>
      <div className="mt-8">
        <PlaybookList playbooks={playbooks.map((p) => ({ id: p.id, name: p.name, contentType: p.contentType, targetTool: p.targetTool, requirements: p.requirements, promptTemplate: p.promptTemplate, createdAt: p.createdAt.toISOString() }))} />
      </div>
    </main>
  );
}
