/**
 * AI platforms UPSHIFT can sit on. Shared by the server and the browser
 * extension, so it must stay free of Node and DOM dependencies.
 */
export const PLATFORMS = [
  { id: "chatgpt", label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"] },
  { id: "claude", label: "Claude", hosts: ["claude.ai"] },
  { id: "gemini", label: "Gemini", hosts: ["gemini.google.com"] },
  { id: "grok", label: "Grok", hosts: ["grok.com"] },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"] | "other";
export const PLATFORM_IDS = ["chatgpt", "claude", "gemini", "grok", "other"] as const;

export function platformLabel(id: string) {
  return PLATFORMS.find((p) => p.id === id)?.label ?? "your AI tool";
}

/** Exact host or a subdomain of it; never a substring match (evil-chatgpt.com is not ChatGPT). */
export function detectPlatform(hostname: string): PlatformId | null {
  const h = hostname.toLowerCase();
  for (const p of PLATFORMS) if (p.hosts.some((x) => h === x || h.endsWith(`.${x}`))) return p.id;
  return null;
}

export const MODES = ["quick", "deep", "expert"] as const;
export type Mode = (typeof MODES)[number];
