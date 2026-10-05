import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";

const STEPS = ["Brief", "Prompt", "Audit", "Fix", "Compare"];

export default async function Home() {
  if (await currentUser()) redirect("/app");
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-bg text-ink">
      <div className="grain absolute inset-0" aria-hidden />
      <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-12 md:py-6">
        <Logo />
        <Link href="/login" className="btn btn-quiet">
          Sign in
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 pb-24 md:px-12">
        <h1 className="rise-in max-w-3xl text-[clamp(2.25rem,7vw,4.5rem)] font-light leading-[1.02] tracking-tight">
          Get more out of
          <br />
          every AI.
        </h1>
        <p className="rise-in mt-5 max-w-md text-ink-3" style={{ animationDelay: "80ms" }}>
          Sharper prompts. Outputs checked against what you asked for.
        </p>
        <div className="rise-in mt-10 flex items-center gap-6" style={{ animationDelay: "160ms" }}>
          <Link href="/signup" className="btn btn-primary group h-11 px-5 text-sm">
            Get started
            <ArrowUpRight className="nudge h-4 w-4" aria-hidden />
          </Link>
        </div>
        <p className="rise-in mt-20 flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm text-ink-3" style={{ animationDelay: "240ms" }}>
          {STEPS.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-3">
              <span className="loop-step">{s}</span>
              {i < STEPS.length - 1 ? <span aria-hidden>→</span> : null}
            </span>
          ))}
        </p>
      </section>
    </main>
  );
}
