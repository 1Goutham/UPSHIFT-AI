import { h, star } from "../lib/dom";
import { getSettings, normaliseServer, saveSettings } from "../services/settings";
import type { Settings } from "../services/types";

/**
 * Extension settings: connect to an UPSHIFT server with a token from
 * Settings → Extension, and the privacy controls.
 */
const app = document.getElementById("app")!;
if (location.search.includes("page") || window.innerWidth > 500) document.body.classList.add("page");

type Conn = { state: "idle" } | { state: "checking" } | { state: "ok"; name: string; refine: boolean } | { state: "error"; message: string };
let conn: Conn = { state: "idle" };

async function check(s: Settings): Promise<Conn> {
  const origin = normaliseServer(s.serverUrl);
  if (!origin) return { state: "error", message: "Server must be an https:// address (or localhost)." };
  if (!s.token) return { state: "idle" };
  if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) return { state: "error", message: "Permission to reach this server was not granted." };
  try {
    const res = await fetch(`${origin}/api/ext/me`, { headers: { authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => null);
    if (res.status === 401) return { state: "error", message: "Token rejected. Create a new one in UPSHIFT → Settings." };
    if (!res.ok || typeof body?.name !== "string") return { state: "error", message: "That server didn't answer like UPSHIFT." };
    return { state: "ok", name: body.name, refine: body.refine === true };
  } catch {
    return { state: "error", message: "Couldn't reach the server." };
  }
}

async function connect(server: string, token: string) {
  const origin = normaliseServer(server);
  if (!origin) {
    conn = { state: "error", message: "Server must be an https:// address (or localhost)." };
    return render();
  }
  // Ask only for this one origin, at the moment the user connects.
  const granted = (await chrome.permissions.contains({ origins: [`${origin}/*`] })) || (await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false));
  if (!granted) {
    conn = { state: "error", message: "UPSHIFT needs permission to reach your server to refine prompts." };
    return render();
  }
  await saveSettings({ serverUrl: origin, token: token.trim() });
  conn = { state: "checking" };
  render();
  conn = await check(await getSettings());
  render();
}

async function render() {
  const s = await getSettings();
  const server = h("input", { type: "url", value: s.serverUrl, "aria-label": "UPSHIFT server", spellcheck: "false" }) as HTMLInputElement;
  const token = h("input", { type: "password", value: s.token, placeholder: "upx_…", "aria-label": "Extension token", autocomplete: "off" }) as HTMLInputElement;

  const status =
    conn.state === "ok"
      ? h("div", { class: "status" }, h("span", { class: "dot on" }), h("div", {}, `Connected as ${conn.name}`, h("div", { class: "fine" }, conn.refine ? "Refinement is on." : "The server has no model configured; only local analysis works.")))
      : conn.state === "checking"
        ? h("div", { class: "status" }, h("span", { class: "dot" }), "Checking…")
        : conn.state === "error"
          ? h("div", { class: "status" }, h("span", { class: "dot err" }), h("span", { class: "err", role: "alert" }, conn.message))
          : h("div", { class: "status" }, h("span", { class: "dot" }), h("span", { class: "sub" }, "Not connected. Local analysis still works."));

  const toggle = (label: string, hint: string, checked: boolean, key: "liveHints" | "saveHistory") => {
    const input = h("input", { type: "checkbox", checked, "aria-label": label, onchange: (e: Event) => saveSettings({ [key]: (e.target as HTMLInputElement).checked }) });
    return h("label", { class: "toggle" }, h("span", {}, label, h("small", {}, hint)), input);
  };

  const nodes: (Node | null)[] = [
    h("div", { class: "brand" }, star(14), "UPSHIFT"),
    h("p", { class: "sub" }, "Get more out of every AI."),
    status,
    h("label", { class: "f" }, h("span", {}, "Server"), server),
    h("label", { class: "f" }, h("span", {}, "Token"), token),
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary", type: "button", onclick: () => connect(server.value, token.value) }, s.token ? "Reconnect" : "Connect"),
      h("a", { href: `${normaliseServer(server.value) ?? s.serverUrl}/app/settings#extension`, target: "_blank", rel: "noopener" }, "Get a token"),
    ),
    h("div", { class: "hr" }),
    toggle("Live hints", "Count gaps while you type. Runs in your browser.", s.liveHints, "liveHints"),
    toggle("Save to history", "Keep refinements in your UPSHIFT account.", s.saveHistory, "saveHistory"),
    s.disabledHosts.length
      ? h(
          "div",
          { class: "sites" },
          h("span", { class: "fine" }, "Turned off on"),
          ...s.disabledHosts.map((host) =>
            h("div", { class: "row" }, host, h("button", { type: "button", onclick: async () => (await saveSettings({ disabledHosts: s.disabledHosts.filter((x) => x !== host) }), render()) }, "Turn on")),
          ),
        )
      : null,
    h("div", { class: "hr" }),
    h("p", { class: "fine" }, "UPSHIFT reads the prompt box only on ChatGPT, Claude, Gemini and Grok, and only sends it to your server when you click Refine."),
  ];
  app.replaceChildren(...nodes.filter((n): n is Node => n !== null));
}

(async () => {
  render();
  const s = await getSettings();
  if (s.token) {
    conn = { state: "checking" };
    render();
    conn = await check(s);
    render();
  }
})();
