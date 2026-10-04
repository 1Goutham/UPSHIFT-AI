import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-5 text-center">
      <p className="font-mono text-4xl">
        <span className="text-ink-3">[</span> 404 <span className="text-ink-3">]</span>
      </p>
      <p className="text-sm text-ink-3">This page or project doesn&apos;t exist, or isn&apos;t yours.</p>
      <Link href="/app" className="btn btn-ghost">
        Back to projects
      </Link>
    </main>
  );
}
