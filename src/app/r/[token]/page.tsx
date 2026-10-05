import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { sharedReport } from "@/lib/services/share";
import { isFailing, isPassing } from "@/lib/engines/taxonomy";
import { limits } from "@/lib/security/ratelimit";
import { Logo } from "@/components/logo";
import { MethodTag, SeverityTag, StatusMark } from "@/components/ui";

export const metadata: Metadata = { title: "Report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  try {
    await limits.share(ip);
  } catch {
    notFound();
  }
  const r = await sharedReport(token);
  if (!r) notFound();

  const req = r.findings.filter((f) => f.checkKey.startsWith("req:"));
  const issues = r.findings.filter((f) => isFailing(f.status));
  const met = req.filter((f) => isPassing(f.status)).length;
  const total = r.evaluation?.requirements.length ?? 0;
  const file = (key: string) => `/api/r/${token}/files/${key}`;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 md:py-12">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="UPSHIFT">
          <Logo />
        </Link>
        <span className="font-mono text-[11px] text-ink-3">read-only report</span>
      </header>

      <h1 className="mt-10 font-mono text-2xl md:text-3xl">{r.project.name}</h1>
      {r.project.goal ? <p className="mt-2 text-ink-2">{r.project.goal}</p> : null}

      {!r.evaluation || !r.artifact ? (
        <p className="mt-10 text-sm text-ink-3">No audit yet.</p>
      ) : (
        <div className="mt-8 space-y-10">
          <p className="font-mono text-xs text-ink-3">
            v{r.artifact.version} · {r.artifact.label} · {new Date(r.evaluation.createdAt).toLocaleDateString()}
            {r.artifact.sourceUrl ? (
              <>
                {" · "}
                <a href={r.artifact.sourceUrl} rel="noopener noreferrer nofollow" target="_blank" className="underline underline-offset-4 hover:text-ink">
                  open
                </a>
              </>
            ) : null}
          </p>

          {total ? (
            <section>
              <p className="text-lg">
                {met}/{total} met <span className="text-ink-3">· {issues.length} issues</span>
              </p>
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-raise" aria-hidden>
                <span className="bg-pass" style={{ width: `${(met / total) * 100}%` }} />
                <span className="bg-fail" style={{ width: `${(req.filter((f) => isFailing(f.status)).length / total) * 100}%` }} />
              </div>
            </section>
          ) : null}

          {r.evaluation.screenshots.length ? (
            <section className="flex gap-3 overflow-x-auto">
              {[...r.evaluation.screenshots].sort((a, b) => a.width - b.width).map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.key} src={file(s.key)} alt={`${s.name} ${s.width}px`} className={`h-60 rounded-md border border-line object-cover object-top ${s.name === "mobile" ? "w-28" : "w-96"}`} />
              ))}
            </section>
          ) : null}

          {issues.length ? (
            <section>
              <h2 className="eyebrow mb-3">Issues</h2>
              <ul className="divide-y divide-line border-y border-line">
                {issues.map((f) => (
                  <li key={f.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <span className="pt-1.5">
                        <StatusMark status={f.status} method={f.method} />
                      </span>
                      <span className="flex-1 text-sm">{f.title}</span>
                      <SeverityTag severity={f.severity} />
                      <MethodTag method={f.method} />
                    </div>
                    {f.recommendation ? <p className="ml-6 mt-1 text-xs text-ink-3">{f.recommendation}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {req.length ? (
            <section>
              <h2 className="eyebrow mb-3">Requirements</h2>
              <ul className="space-y-2">
                {req.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 text-sm">
                    <span className="pt-1.5">
                      <StatusMark status={f.status} method={f.method} />
                    </span>
                    <span className={isPassing(f.status) ? "text-ink" : "text-ink-2"}>{f.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="border-t border-line pt-4 text-[11px] text-ink-3">Filled marks: verified by checks or a browser. Rings: model judgement.</p>
        </div>
      )}
    </main>
  );
}
