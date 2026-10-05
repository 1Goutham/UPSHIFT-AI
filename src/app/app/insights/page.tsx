import Link from "next/link";
import { currentUser } from "@/lib/auth/session";
import { computeInsights } from "@/lib/services/insights";
import { Empty } from "@/components/ui";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const user = (await currentUser())!;
  const data = await computeInsights(user.id);
  return (
    <main className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-10">
      <h1 className="font-mono text-2xl">
        <span className="text-ink-3">[</span> Insights <span className="text-ink-3">]</span>
      </h1>
      <p className="mt-1 text-sm text-ink-3">Counted from your own prompts and audits.</p>

      {!data ? (
        <div className="mt-8">
          <Empty title="Nothing to learn from yet">Insights appear once you have saved prompts and audited outputs.</Empty>
        </div>
      ) : (
        <div className="mt-8 space-y-12">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
            {(
              [
                ["Projects", data.totals.projects],
                ["Prompts analysed", data.totals.originals],
                ["Output versions", data.totals.outputs],
                ["Audits", data.totals.audits],
                ["Corrections", data.totals.corrections],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="bg-bg px-4 py-3">
                <dt className="text-[11px] text-ink-3">{k}</dt>
                <dd className="mt-1 font-mono text-2xl text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          <section>
            <h2 className="eyebrow mb-1">Frequent prompt gaps</h2>
            <div className="mb-4" />
            {data.gaps.length ? (
              <ul className="space-y-5">
                {data.gaps.slice(0, 6).map((g) => (
                  <li key={g.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink">{g.label}</span>
                      <span className="font-mono text-xs text-ink-3">
                        {g.count}/{data.totals.originals}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-raise">
                      <div className="h-1 rounded-full bg-ink-2" style={{ width: `${Math.round(g.share * 100)}%` }} />
                    </div>
                    {g.advice ? <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{g.advice}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No gaps recorded yet.</p>
            )}
          </section>

          <section>
            <h2 className="eyebrow mb-4">Where outputs fail</h2>
            {data.failingByCategory.length ? (
              <ul className="divide-y divide-line border-y border-line">
                {data.failingByCategory.map(([cat, n]) => (
                  <li key={cat} className="flex justify-between py-2 text-sm">
                    <span className="text-ink-2">{cat}</span>
                    <span className="font-mono text-ink">{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No failing findings in your latest audits.</p>
            )}
          </section>

          <section>
            <h2 className="eyebrow mb-1">First vs latest version (failing requirements)</h2>
            <div className="mb-4" />
            {data.trajectories.length ? (
              <ul className="divide-y divide-line border-y border-line">
                {data.trajectories.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/app/p/${t.id}?tab=compare`} className="truncate text-ink hover:underline hover:underline-offset-4">
                      {t.project}
                    </Link>
                    <span className="font-mono text-xs">
                      <span className="text-ink-3">v{t.first.v}</span> {t.first.failing} → <span className="text-ink-3">v{t.last.v}</span>{" "}
                      <span className={t.last.failing < t.first.failing ? "text-pass" : t.last.failing > t.first.failing ? "text-fail" : "text-ink"}>{t.last.failing}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">Needs two audited versions.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
