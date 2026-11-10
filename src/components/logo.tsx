import Image from "next/image";
import hammer from "@/assets/hammer.png";

/** Wordmark. The brand name lives here and in metadata only, so it is easy to change. */
export const BRAND = "Upshift AI";

export function Logo({ className = "", bracket = true }: { className?: string; bracket?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-[15px] tracking-[0.04em] text-ink ${className}`}>
      {bracket ? <span className="bracket-l">[</span> : null}
      <Image src={hammer} alt="" width={26} height={26} priority className="h-[1.6em] w-[1.6em] object-contain" />
      <span>{BRAND}</span>
      {bracket ? <span className="bracket-r">]</span> : null}
    </span>
  );
}
