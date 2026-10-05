import { getSettings, normaliseServer } from "../services/settings";
import { parseRefineResult } from "../services/validate";
import type { Msg, RefineReply } from "../services/types";

/**
 * The only part of the extension that talks to the network, and only when
 * the user clicks Refine. Running here (not in the page) keeps the token
 * out of the AI site's JavaScript context and avoids page CSP/CORS.
 */

async function refine(msg: Extract<Msg, { type: "refine" }>): Promise<RefineReply> {
  const s = await getSettings();
  const origin = normaliseServer(s.serverUrl);
  if (!origin || !s.token) return { ok: false, code: "not_connected", error: "Connect UPSHIFT to refine." };
  if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) return { ok: false, code: "no_permission", error: "Allow UPSHIFT to reach your server in the extension settings." };

  let res: Response;
  try {
    res = await fetch(`${origin}/api/refine`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ prompt: msg.prompt, platform: msg.platform, mode: msg.mode, save: s.saveHistory, source: "extension" }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return { ok: false, code: "network", error: "Couldn't reach UPSHIFT. Check your connection and try again." };
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401) return { ok: false, code: "auth", error: "Your UPSHIFT connection expired. Reconnect in settings." };
  if (!res.ok) return { ok: false, code: "provider", error: typeof body?.error === "string" ? body.error.slice(0, 200) : "Couldn't refine this prompt right now. Try again." };
  const result = parseRefineResult(body);
  if (!result) return { ok: false, code: "invalid", error: "UPSHIFT returned something unexpected. Try again." };
  return { ok: true, result };
}

chrome.runtime.onMessage.addListener((msg: Msg, sender, reply) => {
  // Only our own content scripts and pages may ask for work.
  if (sender.id !== chrome.runtime.id) return false;
  if (msg.type === "refine") {
    refine(msg).then(reply);
    return true; // async reply
  }
  if (msg.type === "open-options") {
    chrome.runtime.openOptionsPage();
    return false;
  }
  return false;
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-upshift" && tab?.id !== undefined) chrome.tabs.sendMessage(tab.id, { type: "toggle" } satisfies Msg).catch(() => {});
});

// Chrome only runs content scripts on pages loaded after install. Attach to AI
// tabs that are already open, so UPSHIFT appears without a refresh.
async function attachToOpenTabs() {
  const matches = chrome.runtime.getManifest().content_scripts?.[0]?.matches ?? [];
  const tabs = await chrome.tabs.query({ url: matches }).catch(() => []);
  await Promise.all(
    tabs
      .filter((tab) => tab.id !== undefined && !tab.discarded)
      .map((tab) => chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ["content.js"] }).catch(() => {})),
  );
  return tabs.length;
}
chrome.runtime.onInstalled.addListener(() => void attachToOpenTabs());

declare const __DEV__: boolean;
// Tests can't reinstall the extension under a live tab; dev builds expose the same path.
if (typeof __DEV__ !== "undefined" && __DEV__) (globalThis as Record<string, unknown>).__upshiftAttach = attachToOpenTabs;
