import type { Settings } from "./types";

declare const __DEFAULT_SERVER__: string;

export const DEFAULTS: Settings = {
  serverUrl: typeof __DEFAULT_SERVER__ === "string" ? __DEFAULT_SERVER__ : "http://localhost:3000",
  token: "",
  liveHints: true,
  saveHistory: false,
  disabledHosts: [],
  mode: "quick",
};

/** Token lives in storage.local (this device only); preferences sync. */
export async function getSettings(): Promise<Settings> {
  const [sync, local] = await Promise.all([chrome.storage.sync.get(["serverUrl", "liveHints", "saveHistory", "disabledHosts", "mode"]), chrome.storage.local.get(["token"])]);
  return { ...DEFAULTS, ...(sync as Partial<Settings>), token: (local.token as string) ?? "" };
}

export async function saveSettings(patch: Partial<Settings>) {
  const { token, ...rest } = patch;
  if (token !== undefined) await chrome.storage.local.set({ token });
  if (Object.keys(rest).length) await chrome.storage.sync.set(rest);
}

/** "https://x.y/" → "https://x.y" ; null if not http(s). */
export function normaliseServer(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) return null;
    return u.origin;
  } catch {
    return null;
  }
}
