import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { QuickAudit } from "@/components/quick-audit";

const BUILDERS = ["Lovable", "v0", "Bolt", "Cursor", "Replit", "Claude Code"];

export default async function Home() {
  const user = await currentUser();
  if (user && !user.isGuest) redirect("/app");
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-bg text-ink">
      <div className="grain absolute inset-0" aria-hidden />
      <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-12 md:py-6">
        <Logo />
        <Link href={user ? "/app" : "/login"} className="btn btn-quiet">
          {user ? "Your audits" : "Sign in"}
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 pb-24 md:px-12">
        <h1 className="rise-in max-w-3xl text-[clamp(2.25rem,7vw,4.5rem)] font-light leading-[1.02] tracking-tight">
          Did the AI build
          <br />
          what you asked?
        </h1>
        <p className="rise-in mt-5 max-w-md text-ink-3" style={{ animationDelay: "80ms" }}>
          Paste your site. Get proof, and the exact prompt to fix it.
        </p>
        <div className="rise-in mt-10" style={{ animationDelay: "160ms" }}>
          <QuickAudit autoFocus />
          <p className="mt-3 font-mono text-[11px] text-ink-3">Free · no sign-up · real browser, phone and desktop</p>
        </div>
        <p className="rise-in mt-20 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-3" style={{ animationDelay: "240ms" }}>
          <span className="text-ink-2">For sites built with</span>
          {BUILDERS.map((b) => (
            <span key={b} className="loop-step">
              {b}
            </span>
          ))}
        </p>
      </section>
    </main>
  );
}
