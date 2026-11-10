import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import robot from "@/assets/robot.png";
import { currentUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { QuickAuditLine } from "@/components/quick-audit";

const STEPS = ["Understand", "Optimise", "Execute", "Evolve"];

export default async function Home() {
  const user = await currentUser();
  if (user && !user.isGuest) redirect("/app");
  return (
    <main className="flex min-h-dvh flex-col bg-bg px-6 text-ink md:px-[4.75vw]">
      <header className="flex items-center justify-between pt-8 md:pt-[5.5vh]">
        <Link href="/" aria-label="Upshift AI home" className="bracket-hover bracket-strong">
          <Logo className="text-[clamp(1rem,1.3vw,1.6rem)]" />
        </Link>
        <Link href={user ? "/app" : "/login"} className="bracket bracket-strong text-[clamp(1rem,1.3vw,1.6rem)]">
          <span className="bracket-l">[</span>
          <span className="bracket-t">{user ? "Your work" : "Sign in"}</span>
          <span className="bracket-r">]</span>
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-[clamp(36rem,46vw,72rem)] flex-1 flex-col justify-center py-14">
        <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:gap-14">
          <Image src={robot} alt="A small robot being knocked over by a hammer" priority sizes="(min-width: 640px) 13vw, 180px" className="rise-in h-auto w-[180px] shrink-0 select-none sm:w-[clamp(200px,13vw,320px)] sm:-ml-3" />
          <div className="rise-in" style={{ animationDelay: "80ms" }}>
            <h1 className="text-[clamp(2rem,2.45vw,3.5rem)] font-light leading-[1.2] tracking-[-0.01em]">
              Get <strong className="font-semibold">more</strong> out of
              <br />
              every <strong className="font-semibold">AI</strong> :)
            </h1>
            <p className="mt-[0.9em] max-w-[19em] text-[clamp(1.05rem,1.36vw,1.9rem)] font-light leading-[1.32] text-ink-2">
              Turn vague prompts into precise instructions, right where you write them.
              <br className="hidden sm:block" /> Then check what comes back.
            </p>
          </div>
        </div>

        <div className="rise-in mt-[clamp(2.5rem,4.5vw,6rem)] flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-[clamp(1rem,1.2vw,1.75rem)]" style={{ animationDelay: "160ms" }}>
          <QuickAuditLine />
          <Link href="/extension" className="pill pill-solid group self-start sm:self-auto">
            Get the extension <ArrowUpRight className="nudge h-5 w-5" aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="flex flex-col gap-3 pb-8 text-[clamp(0.85rem,0.95vw,1.15rem)] font-light text-ink-2 sm:flex-row sm:items-center sm:justify-between md:pb-[5vh]">
        <ol className="flex flex-wrap gap-x-6 gap-y-1">
          {STEPS.map((s, i) => (
            <li key={s}>
              [0{i + 1}] {s}
            </li>
          ))}
        </ol>
        <a href="https://github.com/1goutham" target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 hover:text-ink">
          A Product by 1Goutham <ArrowUpRight className="nudge h-3.5 w-3.5" aria-hidden />
        </a>
      </footer>
    </main>
  );
}
