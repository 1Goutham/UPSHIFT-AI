import { currentUser } from "@/lib/auth/session";
import { providerStatus } from "@/lib/ai/provider";
import { RefineLab } from "@/components/refine-lab";

export const metadata = { title: "Refine" };

export default async function RefinePage() {
  const user = (await currentUser())!;
  const p = providerStatus();
  return (
    <main className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-mono text-2xl">
          <span className="text-ink-3">[</span> Refine <span className="text-ink-3">]</span>
        </h1>
        <a href="/app/settings#extension" className="text-xs text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
          Use it inside ChatGPT, Claude, Gemini and Grok
        </a>
      </div>
      <div className="mt-8">
        <RefineLab modelReady={p.configured} canSave={!user.isGuest} />
      </div>
    </main>
  );
}
