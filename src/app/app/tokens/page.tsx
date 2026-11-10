import { providerStatus } from "@/lib/ai/provider";
import { TokenLab } from "@/components/token-lab";

export const metadata = { title: "Tokens" };

export default function TokensPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-10">
      <h1 className="font-mono text-2xl">
        <span className="text-ink-3">[</span> Tokens <span className="text-ink-3">]</span>
      </h1>
      <p className="mt-2 text-sm text-ink-3">Same request, fewer tokens. Every cut is checked so nothing you asked for is lost.</p>
      <div className="mt-8">
        <TokenLab modelReady={providerStatus().configured} />
      </div>
    </main>
  );
}
