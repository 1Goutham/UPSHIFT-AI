import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { listProjects } from "@/lib/repo/projects";
import { CONTENT_TYPES } from "@/lib/engines/taxonomy";
import { providerStatus } from "@/lib/ai/provider";
import { NewProject } from "@/components/new-project";
import { Empty } from "@/components/ui";

export const metadata = { title: "Projects" };

function ago(d: Date) {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default async function ProjectsPage() {
  const user = (await currentUser())!;
  const projects = await listProjects(user.id);
  const db = await getDb();
  const ids = projects.map((p) => p.id);
  const [arts, playbooks] = await Promise.all([
    ids.length ? db.select({ projectId: schema.artifacts.projectId, version: schema.artifacts.version }).from(schema.artifacts).where(inArray(schema.artifacts.projectId, ids)) : [],
    db.select({ id: schema.playbooks.id, name: schema.playbooks.name }).from(schema.playbooks).where(eq(schema.playbooks.userId, user.id)).orderBy(desc(schema.playbooks.createdAt)),
  ]);
  const versions = new Map<string, number>();
  for (const a of arts) versions.set(a.projectId, Math.max(versions.get(a.projectId) ?? 0, a.version));
  const provider = providerStatus();

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl">
            <span className="text-ink-3">[</span> Projects <span className="text-ink-3">]</span>
          </h1>
        </div>
        {!provider.configured ? (
          <Link href="/app/settings" className="text-xs text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
            model off
          </Link>
        ) : null}
      </div>

      <div className="mt-8">
        <NewProject startOpen={projects.length === 0} playbooks={playbooks} />
      </div>

      <section className="mt-10" aria-labelledby="list-h">
        <h2 id="list-h" className="eyebrow mb-3">
          All projects · {projects.length}
        </h2>
        {projects.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/app/p/${p.id}`} className="row-hover group grid grid-cols-[1fr_auto] items-center gap-4 px-2 py-4 md:grid-cols-[1fr_140px_90px_90px]">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] text-ink group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{p.name}</span>
                    {p.goal ? <span className="mt-0.5 block truncate text-sm text-ink-3">{p.goal}</span> : null}
                  </span>
                  <span className="hidden text-sm text-ink-2 md:block">{CONTENT_TYPES.find((c) => c.id === p.contentType)?.label}</span>
                  <span className="hidden font-mono text-xs text-ink-3 md:block">{versions.get(p.id) ? `v${versions.get(p.id)}` : "no output"}</span>
                  <span className="text-right font-mono text-xs text-ink-3">{ago(p.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No projects yet" />
        )}
      </section>
    </main>
  );
}
