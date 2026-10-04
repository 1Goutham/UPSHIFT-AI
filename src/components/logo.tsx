import { Asterisk } from "./ui";

/** Wordmark. The brand name lives here and in metadata only, so it is easy to change. */
export const BRAND = "UPSHIFT";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[15px] font-bold tracking-[0.14em] ${className}`}>
      {BRAND}
      <Asterisk className="text-[13px] text-accent" />
    </span>
  );
}
