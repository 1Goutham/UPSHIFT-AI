"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-5 text-center">
      <p className="font-mono text-2xl">
        <span className="text-ink-3">[</span> Something broke <span className="text-ink-3">]</span>
      </p>
      <p className="max-w-sm text-sm text-ink-3">The page failed to load. Your saved projects are not affected.</p>
      <button type="button" className="btn btn-ghost" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
