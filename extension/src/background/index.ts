import { getSettings, normaliseServer } from "../services/settings";
import { parseRefineResult } from "../services/validate";
import { REFINE_PORT, type Msg, type RefinePortMsg, type RefineReply, type RefineRequest } from "../services/types";

/**
 * The only part of the extension that talks to the network, and only when
 * the user clicks Refine. Running here (not in the page) keeps the token
 * out of the AI site's JavaScript context and avoids page CSP/CORS.
 */

async function refine(msg: RefineRequest, onDelta: (soFar: string) => void): Promise<RefineReply> {
  const s = await getSettings();
  const origin = normaliseServer(s.serverUrl);
  if (!origin || !s.token) return { ok: false, code: "not_connected", error: "Connect UPSHIFT to refine." };
  if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) return { ok: false, code: "no_permission", error: "Allow UPSHIFT to reach your server in the extension settings." };

  let res: Response;
  try {
    res = await fetch(`${origin}/api/refine`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ prompt: msg.prompt, platform: msg.platform, mode: msg.mode, save: s.saveHistory, source: "extension", stream: true }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return { ok: false, code: "network", error: "Couldn't reach UPSHIFT. Check your connection and try again." };
  }
  if (res.status === 401) return { ok: false, code: "auth", error: "Your UPSHIFT connection expired. Reconnect in settings." };
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { ok: false, code: "provider", error: typeof body?.error === "string" ? body.error.slice(0, 200) : "Couldn't refine this prompt right now. Try again." };
  }

  // Streamed (NDJSON) from current servers; a plain JSON body from older ones.
  let body: unknown = null;
  if (/ndjson/.test(res.headers.get("content-type") ?? "") && res.body) {
    try {
      body = await readNdjson(res.body, onDelta);
    } catch (e) {
      if (e instanceof StreamError) return { ok: false, code: e.status === 401 ? "auth" : "provider", error: e.message.slice(0, 200) };
      return { ok: false, code: "network", error: "The connection dropped while refining. Try again." };
    }
  } else body = await res.json().catch(() => null);

  const result = parseRefineResult(body);
  if (!result) return { ok: false, code: "invalid", error: "UPSHIFT returned something unexpected. Try again." };
  return { ok: true, result };
}

class StreamError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Reads the refine stream: forwards display-only deltas, returns the final result for validation. */
async function readNdjson(stream: ReadableStream<Uint8Array>, onDelta: (soFar: string) => void): Promise<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev: { type?: string; refined?: unknown; result?: unknown; error?: unknown; status?: unknown };
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "delta" && typeof ev.refined === "string") onDelta(ev.refined.slice(0, 50_000));
      else if (ev.type === "done") return ev.result;
      else if (ev.type === "error") throw new StreamError(typeof ev.error === "string" ? ev.error : "Couldn't refine this prompt right now. Try again.", typeof ev.status === "number" ? ev.status : 502);
    }
    if (done) throw new Error("stream ended without a result");
  }
}

chrome.runtime.onConnect.addListener((port) => {
  // Only our own content scripts may ask for work.
  if (port.name !== REFINE_PORT || port.sender?.id !== chrome.runtime.id) return port.disconnect();
  let open = true;
  port.onDisconnect.addListener(() => (open = false));
  port.onMessage.addListener(async (msg: RefineRequest) => {
    const post = (m: RefinePortMsg) => {
      if (open) port.postMessage(m);
    };
    const reply = await refine(msg, (refined) => post({ type: "delta", refined }));
    post({ type: "result", reply });
  });
});

chrome.runtime.onMessage.addListener((msg: Msg, sender) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg.type === "open-options") chrome.runtime.openOptionsPage();
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
