import Link from "next/link";
import { Download } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";

export const metadata = { title: "Extension", description: "Analyse and refine prompts inside ChatGPT, Claude, Gemini and Grok." };

const STEPS = [
  ["Write", "Type your prompt in ChatGPT, Claude, Gemini or Grok as usual."],
  ["See the gaps", "The ✦ UPSHIFT button counts what's vague or missing. Instantly, in your browser."],
  ["Refine", "Quick, Deep or Expert. Your intent is kept and checked, not rewritten."],
  ["Use it", "Replace the prompt in place, or copy it. Undo any time."],
];

export default async function ExtensionPage() {
  const user = await currentUser();
  return (
    <main className="min-h-dvh bg-bg px-5 py-6 text-ink md:px-12">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
        <Link href={user && !user.isGuest ? "/app/settings#extension" : "/signup"} className="btn btn-quiet">
          {user && !user.isGuest ? "Connect" : "Create account"}
        </Link>
      </header>

      <section className="mx-auto max-w-3xl py-16 md:py-24">
        <h1 className="text-[clamp(2rem,6vw,3.5rem)] font-light leading-[1.05] tracking-tight">UPSHIFT for the AI tools you already use.</h1>

        {/* Static mock of the composer button, drawn with the real styles. */}
        <div className="mt-12 rounded-xl border border-line bg-panel p-4" aria-hidden>
          <p className="text-ink-2">Build me a portfolio website with a cool dark design and some animations.</p>
          <div className="mt-6 flex items-center justify-end gap-3">
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-line-strong bg-bg px-2.5 text-accent">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7" />
              </svg>
              <span className="text-[11px] font-semibold tracking-[0.12em] text-ink">UPSHIFT</span>
              <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-black">5</span>
            </span>
            <span className="text-sm text-ink-3">Send →</span>
          </div>
        </div>

        <ol className="mt-14 grid gap-8 sm:grid-cols-2">
          {STEPS.map(([t, d], i) => (
            <li key={t}>
              <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
              <p className="mt-1 text-ink">{t}</p>
              <p className="mt-1 text-sm text-ink-3">{d}</p>
            </li>
          ))}
        </ol>

        <div className="mt-14 flex flex-wrap items-center gap-4">
          <a href="/upshift-extension.zip" download className="btn btn-primary h-11 px-5 text-sm">
            <Download className="h-4 w-4" /> Download for Chrome
          </a>
          <span className="text-sm text-ink-3">
            Unzip → <code className="font-mono text-ink-2">chrome://extensions</code> → Developer mode → Load unpacked
          </span>
        </div>

        <section className="mt-16 border-t border-line pt-8">
          <h2 className="eyebrow mb-3">Privacy</h2>
          <ul className="space-y-1.5 text-sm text-ink-2">
            <li>Runs only on ChatGPT, Claude, Gemini and Grok. Turn it off per site.</li>
            <li>Gap analysis happens in your browser. Nothing is sent while you type.</li>
            <li>Your prompt goes to your UPSHIFT server only when you click Refine.</li>
            <li>History is off unless you turn it on. Permissions: storage only.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
