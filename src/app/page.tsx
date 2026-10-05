import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { QuickAudit } from "@/components/quick-audit";

const TOOLS = ["ChatGPT", "Claude", "Gemini", "Grok"];

export default async function Home() {
  const user = await currentUser();
  if (user && !user.isGuest) redirect("/app");
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-bg text-ink">
      <div className="grain absolute inset-0" aria-hidden />
      <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-12 md:py-6">
        <Logo />
        <Link href={user ? "/app" : "/login"} className="btn btn-quiet">
          {user ? "Your work" : "Sign in"}
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 pb-20 md:px-12">
        <h1 className="rise-in max-w-3xl text-[clamp(2.25rem,7vw,4.5rem)] font-light leading-[1.02] tracking-tight">
          Get more out of
          <br />
          every AI.
        </h1>
        <p className="rise-in mt-5 max-w-md text-ink-3" style={{ animationDelay: "80ms" }}>
          Turn vague prompts into precise instructions, right where you write them. Then check what comes back.
        </p>

        <div className="rise-in mt-10 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ animationDelay: "160ms" }}>
          <Link href="/extension" className="btn btn-primary group h-11 px-5 text-sm">
            Get the extension
            <ArrowUpRight className="nudge h-4 w-4" aria-hidden />
          </Link>
          <span className="flex flex-wrap gap-x-3 font-mono text-xs text-ink-3">
            {TOOLS.map((t) => (
              <span key={t} className="loop-step">
                {t}
              </span>
            ))}
          </span>
        </div>

        <div className="rise-in mt-16 max-w-xl border-t border-line pt-8" style={{ animationDelay: "240ms" }}>
          <p className="mb-3 text-sm text-ink-2">Already built a site with AI? Check it.</p>
          <QuickAudit compact />
          <p className="mt-2 font-mono text-[11px] text-ink-3">Free · no sign-up · real browser</p>
        </div>
      </section>
    </main>
  );
}
