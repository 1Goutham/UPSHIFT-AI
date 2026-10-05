import { h, mark } from "../lib/dom";
import { getSettings, normaliseServer, saveSettings } from "../services/settings";
import type { Settings } from "../services/types";

/**
 * Extension settings: connect to an UPSHIFT server with a token from
 * Settings, and the privacy controls.
 */
const app = document.getElementById("app")!;
if (location.search.includes("page") || window.innerWidth > 500) document.body.classList.add("page");

type Conn = { state: "idle" } | { state: "checking" } | { state: "ok"; name: string; refine: boolean } | { state: "error"; message: string };
let conn: Conn = { state: "idle" };
let editing = false;

async function check(s: Settings): Promise<Conn> {
  const origin = normaliseServer(s.serverUrl);
  if (!origin) return { state: "error", message: "Use an https address." };
  if (!s.token) return { state: "idle" };
  if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) return { state: "error", message: "Access to this server wasn't allowed." };
  try {
    const res = await fetch(`${origin}/api/ext/me`, { headers: { authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => null);
    if (res.status === 401) return { state: "error", message: "That token no longer works. Create a new one." };
    if (!res.ok || typeof body?.name !== "string") return { state: "error", message: "That address isn't an UPSHIFT server." };
    return { state: "ok", name: body.name, refine: body.refine === true };
  } catch {
    return { state: "error", message: "Couldn't reach the server." };
  }
}

async function connect(server: string, token: string) {
  const origin = normaliseServer(server);
  if (!origin) {
    conn = { state: "error", message: "Use an https address." };
    return render();
  }
  if (!token.trim()) {
    conn = { state: "error", message: "Paste your token." };
    return render();
  }
  // Ask only for this one origin, at the moment the user connects.
  const granted = (await chrome.permissions.contains({ origins: [`${origin}/*`] })) || (await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false));
  if (!granted) {
    conn = { state: "error", message: "UPSHIFT needs access to your server to refine prompts." };
    return render();
  }
  await saveSettings({ serverUrl: origin, token: token.trim() });
  conn = { state: "checking" };
  render();
  conn = await check(await getSettings());
  if (conn.state === "ok") editing = false;
  render();
}

async function disconnect() {
  await saveSettings({ token: "" });
  conn = { state: "idle" };
  editing = false;
  render();
}

async function render() {
  const s = await getSettings();
  const nodes: (Node | null)[] = [h("div", { class: "brand" }, mark(15), "UPSHIFT")];

  if (conn.state === "ok" && !editing) {
    nodes.push(
      h(
        "div",
        { class: "card status" },
        h("span", { class: "dot on" }),
        h("div", { class: "who" }, h("strong", {}, conn.name), h("small", {}, conn.refine ? "Connected" : "Connected. This server has no AI model set up.")),
      ),
      h(
        "div",
        { class: "row-c" },
        h("button", { class: "link", type: "button", onclick: () => ((editing = true), render()) }, "Change"),
        h("button", { class: "link", type: "button", onclick: disconnect }, "Disconnect"),
      ),
    );
  } else {
    const server = h("input", { type: "url", value: s.serverUrl, "aria-label": "UPSHIFT server", spellcheck: "false", placeholder: "https://" }) as HTMLInputElement;
    const token = h("input", { type: "password", value: s.token, placeholder: "upx_", "aria-label": "Extension token", autocomplete: "off" }) as HTMLInputElement;
    const status =
      conn.state === "checking"
        ? h("div", { class: "card status" }, h("span", { class: "dot" }), h("div", { class: "who" }, h("small", {}, "Connecting")))
        : conn.state === "error"
          ? h("p", { class: "err", role: "alert" }, conn.message)
          : null;
    nodes.push(
      h("div", { class: "card" }, h("label", { class: "field" }, h("span", {}, "Server"), server), h("label", { class: "field" }, h("span", {}, "Token"), token)),
      status,
      h("button", { class: "primary", type: "button", onclick: () => connect(server.value, token.value) }, "Connect"),
      h(
        "div",
        { class: "row-c" },
        h("a", { class: "link", href: `${normaliseServer(server.value) ?? s.serverUrl}/app/settings#extension`, target: "_blank", rel: "noopener" }, "Get a token"),
        editing ? h("button", { class: "link", type: "button", onclick: () => ((editing = false), render()) }, "Cancel") : null,
      ),
    );
  }

  const toggle = (label: string, checked: boolean, key: "liveHints" | "saveHistory") =>
    h(
      "label",
      { class: "toggle" },
      h("span", {}, label),
      h("input", { type: "checkbox", class: "switch", role: "switch", checked, "aria-label": label, onchange: (e: Event) => saveSettings({ [key]: (e.target as HTMLInputElement).checked }) }),
    );
  nodes.push(h("div", { class: "card" }, toggle("Live hints", s.liveHints, "liveHints"), toggle("Save history", s.saveHistory, "saveHistory")));

  if (s.disabledHosts.length) {
    nodes.push(
      h("p", { class: "group-title" }, "Turned off"),
      h(
        "div",
        { class: "card" },
        ...s.disabledHosts.map((host) =>
          h(
            "div",
            { class: "site" },
            h("span", {}, host),
            h("button", { class: "link", type: "button", onclick: async () => (await saveSettings({ disabledHosts: s.disabledHosts.filter((x) => x !== host) }), render()) }, "Turn on"),
          ),
        ),
      ),
    );
  }

  nodes.push(h("p", { class: "fine" }, "Your prompt is only sent when you press Refine."));
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
