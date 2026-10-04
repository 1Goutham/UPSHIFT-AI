import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { Asterisk } from "@/components/ui";

const LOOP = ["Intent", "Strategy", "Context", "Execution", "Evaluation", "Improvement", "Learning"];

const STEPS = [
  {
    n: "01",
    title: "Say what you actually want",
    body: "Your goal and your original prompt become an editable brief: audience, constraints, exclusions and a checklist you confirm. Assumptions are labelled, not hidden.",
  },
  {
    n: "02",
    title: "Send a better prompt",
    body: "See exactly what is missing from the prompt, then get a sharper version that keeps your words and decisions. Not longer. Clearer.",
  },
  {
    n: "03",
    title: "Check what came back",
    body: "Paste the URL, screenshot or text the AI produced. Markup checks, a real browser at phone and desktop width, and a model review, each labelled for what it can prove.",
  },
  {
    n: "04",
    title: "Fix only what is broken",
    body: "Selected issues become a targeted correction prompt that names what to keep. Add the next version and see what improved, what regressed and what is still open.",
  },
];

export default async function Home() {
  if (await currentUser()) redirect("/app");
  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg text-ink">
      <div className="grain absolute inset-0" aria-hidden />
      <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-12 md:py-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="btn btn-quiet">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary group">
            Start a project
            <ArrowUpRight className="nudge h-4 w-4" aria-hidden />
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto max-w-5xl px-5 pb-16 pt-10 md:px-12 md:pb-24 md:pt-20">
        <p className="eyebrow rise-in">AI utilisation, measured</p>
        <h1 className="rise-in mt-4 max-w-3xl text-[clamp(1.75rem,5vw,3.25rem)] font-light leading-[1.1] tracking-tight" style={{ animationDelay: "80ms" }}>
          Get more out of every AI.
          <span className="block text-ink-3">Clear briefs, better prompts, and results you can actually check.</span>
        </h1>
        <div className="rise-in mt-8 flex flex-wrap items-center gap-y-3" style={{ animationDelay: "160ms" }}>
          <Link href="/signup" className="bracket text-lg md:text-xl">
            <span className="bracket-l" aria-hidden>[</span>
            <span className="bracket-t">Create an account</span>
            <span className="bracket-r" aria-hidden>]</span>
          </Link>
          <Link href="/login" className="bracket ml-6 text-lg md:text-xl">
            <span className="bracket-l" aria-hidden>[</span>
            <span className="bracket-t">Sign in</span>
            <span className="bracket-r" aria-hidden>]</span>
          </Link>
        </div>

        <p className="rise-in mt-14 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm text-ink-2 md:text-base" style={{ animationDelay: "240ms" }} aria-label="The loop: intent, strategy, context, execution, evaluation, improvement, learning">
          {LOOP.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className="loop-step">{s}</span>
              {i < LOOP.length - 1 ? <span className="text-ink-3" aria-hidden>→</span> : null}
            </span>
          ))}
        </p>
      </section>

      <section className="relative z-10 border-t border-line">
        <ol className="mx-auto grid max-w-5xl gap-px px-5 md:grid-cols-2 md:px-12">
          {STEPS.map((s) => (
            <li key={s.n} className="py-8 md:py-10 md:pr-10">
              <span className="font-mono text-xs text-ink-3">{s.n}</span>
              <h2 className="mt-2 text-lg font-medium">{s.title}</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="relative z-10 border-t border-line px-5 py-6 md:px-12">
        <p className="flex items-center gap-2 text-xs text-ink-3">
          <Asterisk className="text-accent" />
          Every result says how it was checked: verified, model-judged, or not tested.
        </p>
      </footer>
    </main>
  );
}
