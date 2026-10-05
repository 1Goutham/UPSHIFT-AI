import { lintPrompt } from "../../../src/lib/engines/prompt-lint";
import { wordDiff } from "../../../src/lib/refine/intent-check";
import type { Mode } from "../../../src/lib/refine/platforms";
import type { PlatformAdapter } from "../adapters/types";
import { getSettings, saveSettings } from "../services/settings";
import type { Msg, RefineReply, RefineResult } from "../services/types";
import { h, star } from "../lib/dom";
import { CSS } from "./styles";

declare const __DEV__: boolean;

/**
 * The in-page UI: a small button pinned to the AI tool's prompt box, and a
 * panel that opens on demand. Lives in a closed shadow root so the host page
 * cannot style or read it, and it never edits the host page's markup.
 */

type State =
  | { view: "analyse" }
  | { view: "loading" }
  | { view: "result"; result: RefineResult; original: string; replaced: boolean; editing: boolean; showDiff: boolean; note?: string }
  | { view: "error"; message: string; connect?: boolean };

const MODE_LABEL: Record<Mode, string> = { quick: "Quick", deep: "Deep", expert: "Expert" };
const MODE_HINT: Record<Mode, string> = {
  quick: "Fix ambiguity and missing context. Light touch.",
  deep: "Restructure around intent, constraints, output and success criteria.",
  expert: "Deep, plus shaped for this AI tool and task.",
};

export class Overlay {
  private host = document.createElement("upshift-root");
  // Closed in production so the host page can't reach in; open in dev builds so tests can.
  private shadow = this.host.attachShadow({ mode: typeof __DEV__ !== "undefined" && __DEV__ ? "open" : "closed" });
  private root = h("div", { class: "root" });
  private fab: HTMLButtonElement;
  private badge = h("span", { class: "badge", hidden: true });
  private panel: HTMLDivElement | null = null;
  private composer: HTMLElement | null = null;
  private state: State = { view: "analyse" };
  private mode: Mode = "quick";
  private liveHints = true;
  private raf = 0;
  private lastFind = 0;
  private hintTimer = 0;
  private alive = true;
  private observer: MutationObserver | null = null;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions | boolean][] = [];

  constructor(private adapter: PlatformAdapter) {
    this.host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646;";
    this.shadow.append(h("style", {}, CSS), this.root);
    this.fab = h(
      "button",
      { class: "fab", type: "button", "aria-label": "UPSHIFT: analyse and refine this prompt (Alt+U)", title: "UPSHIFT · Alt+U", onclick: () => this.toggle() },
      star(13),
      h("span", { class: "lbl" }, "UPSHIFT"),
      this.badge,
    );
    this.fab.hidden = true;
    this.root.append(this.fab);
  }

  async mount() {
    const s = await getSettings();
    this.mode = s.mode;
    this.liveHints = s.liveHints;
    document.documentElement.append(this.host);
    this.track();
    // SPA pages mount and remount their composer; re-find it cheaply.
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(document.body, { childList: true, subtree: true });
    const on = (t: EventTarget, type: string, fn: EventListener, opts: AddEventListenerOptions | boolean) => {
      t.addEventListener(type, fn, opts);
      this.listeners.push([t, type, fn, opts]);
    };
    on(window, "resize", () => this.schedule(), { passive: true });
    on(window, "scroll", () => this.schedule(), { passive: true, capture: true });
    on(document, "input", (e) => this.onInput(e), true);
    on(document, "keydown", (e) => this.onKey(e as KeyboardEvent), true);
  }

  destroy() {
    this.alive = false;
    this.observer?.disconnect();
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
    this.listeners = [];
    this.host.remove();
  }

  /* ----------------------------- positioning ---------------------------- */

  private schedule() {
    if (!this.alive || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.track();
    });
  }

  private track() {
    const now = performance.now();
    if (!this.composer || !this.composer.isConnected || now - this.lastFind > 1500) {
      this.composer = this.adapter.findComposer(document);
      this.lastFind = now;
    }
    const el = this.composer;
    if (!el) {
      this.fab.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.bottom < 0 || r.top > innerHeight) {
      this.fab.hidden = true;
      return;
    }
    this.fab.hidden = false;
    // Sits on the composer's top edge, right-aligned: clear of the text and the send button.
    const fw = this.fab.offsetWidth || 96;
    this.fab.style.top = `${Math.max(4, r.top - 13)}px`;
    this.fab.style.left = `${Math.min(innerWidth - fw - 8, Math.max(8, r.right - fw - 12))}px`;
    if (this.panel) this.placePanel(r);
  }

  private placePanel(r: DOMRect) {
    const p = this.panel!;
    const width = Math.min(384, innerWidth - 16);
    p.style.left = `${Math.min(innerWidth - width - 8, Math.max(8, r.right - width))}px`;
    const above = r.top - 24;
    if (above >= 260) {
      p.style.bottom = `${innerHeight - r.top + 20}px`;
      p.style.top = "auto";
      p.style.maxHeight = `${Math.min(above, innerHeight * 0.8)}px`;
    } else {
      p.style.top = `${Math.min(r.bottom + 8, innerHeight - 200)}px`;
      p.style.bottom = "auto";
      p.style.maxHeight = `${innerHeight - Math.min(r.bottom + 8, innerHeight - 200) - 8}px`;
    }
  }

  /* ------------------------------- input -------------------------------- */

  private onInput(e: Event) {
    if (!this.liveHints || !this.composer || !(e.target instanceof Node) || !this.composer.contains(e.target)) return;
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => {
      const text = this.composer ? this.adapter.read(this.composer) : "";
      const n = text.trim() ? lintPrompt(text).length : 0;
      this.badge.hidden = n === 0;
      this.badge.textContent = String(n);
      this.fab.setAttribute("aria-label", n ? `UPSHIFT: ${n} possible gaps in this prompt (Alt+U)` : "UPSHIFT: analyse and refine this prompt (Alt+U)");
    }, 350);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && this.panel) {
      this.close();
      e.stopPropagation();
    }
  }

  /* ------------------------------- panel -------------------------------- */

  toggle() {
    if (this.panel) this.close();
    else this.open();
  }

  private open() {
    this.composer = this.adapter.findComposer(document);
    this.panel = h("div", { class: "panel", role: "dialog", "aria-label": "UPSHIFT" }) as HTMLDivElement;
    this.root.append(this.panel);
    if (this.composer) this.placePanel(this.composer.getBoundingClientRect());
    else Object.assign(this.panel.style, { right: "16px", bottom: "16px" });
    if (this.state.view !== "result") this.state = { view: "analyse" };
    this.render();
    (this.panel.querySelector(".primary, button") as HTMLElement | null)?.focus();
  }

  private close() {
    this.panel?.remove();
    this.panel = null;
    this.fab.focus();
  }

  private prompt() {
    return this.composer ? this.adapter.read(this.composer).trim() : "";
  }

  private render() {
    const p = this.panel;
    if (!p) return;
    p.replaceChildren(
      h(
        "div",
        { class: "head" },
        h("span", { class: "brand" }, star(12), h("span", {}, "UPSHIFT")),
        h("span", { class: "plat" }, this.adapter.id === "other" ? "" : `· ${this.adapter.label}`),
        h("button", { class: "x", type: "button", "aria-label": "Close", onclick: () => this.close() }, "✕"),
      ),
      h("div", { class: "body" }, ...this.body()),
      h(
        "div",
        { class: "foot" },
        h("span", { class: "mono" }, "Alt+U"),
        h("button", { type: "button", onclick: () => this.disableHere() }, `Turn off on ${location.hostname}`),
      ),
    );
  }

  private body(): Node[] {
    if (!this.composer) return [h("p", { class: "msg err" }, this.adapter.id === "other" ? "UPSHIFT couldn't identify this AI tool." : "UPSHIFT couldn't find the prompt box on this page.")];
    switch (this.state.view) {
      case "loading":
        return [h("div", { class: "row lead", role: "status" }, h("span", { class: "spin" }, star(14)), `Refining · ${MODE_LABEL[this.mode]}`), h("p", { class: "muted" }, MODE_HINT[this.mode])];
      case "error":
        return [
          h("p", { class: "msg err", role: "alert" }, this.state.message),
          this.state.connect
            ? h("button", { class: "primary", type: "button", onclick: () => chrome.runtime.sendMessage({ type: "open-options" } satisfies Msg) }, "Connect UPSHIFT")
            : h("button", { class: "ghost", type: "button", onclick: () => this.refine() }, "Try again"),
          ...this.analysis(),
        ];
      case "result":
        return this.result(this.state);
      default:
        return this.analysis(true);
    }
  }

  /** Local, instant analysis (no network). */
  private analysis(withAction = false): Node[] {
    const text = this.prompt();
    if (!text) return [h("p", { class: "lead" }, "Add a prompt first."), h("p", { class: "muted" }, "Write what you want in the prompt box, then open UPSHIFT.")];
    const gaps = lintPrompt(text);
    const out: Node[] = [
      h("p", { class: "lead" }, gaps.length ? `Vague in ${gaps.length} area${gaps.length === 1 ? "" : "s"}.` : "No common gaps found."),
      gaps.length
        ? h(
            "div",
            { class: "list" },
            ...gaps.slice(0, 6).map((g) => h("div", { class: "gap", title: g.detail }, h("span", { class: "plus" }, "+"), g.label)),
          )
        : h("p", { class: "muted" }, "Refining can still tighten structure and output format."),
    ];
    if (!withAction) return out;
    out.push(
      h(
        "div",
        { class: "modes", role: "radiogroup", "aria-label": "Refinement depth", onkeydown: (e: Event) => this.modeKeys(e as KeyboardEvent) },
        ...(Object.keys(MODE_LABEL) as Mode[]).map((m) =>
          h(
            "button",
            { type: "button", role: "radio", "aria-checked": String(this.mode === m), tabindex: this.mode === m ? 0 : -1, title: MODE_HINT[m], onclick: () => this.setMode(m) },
            MODE_LABEL[m],
          ),
        ),
      ),
      h("button", { class: "primary", type: "button", onclick: () => this.refine() }, star(12), "Refine prompt"),
      h("p", { class: "muted", style: "font-size:11px" }, "Analysis runs in your browser. Refine sends this prompt to your UPSHIFT server."),
    );
    return out;
  }

  private modeKeys(e: KeyboardEvent) {
    const order = Object.keys(MODE_LABEL) as Mode[];
    const i = order.indexOf(this.mode);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      this.setMode(order[(i + (e.key === "ArrowRight" ? 1 : order.length - 1)) % order.length]);
      (this.panel?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
    }
  }

  private setMode(m: Mode) {
    this.mode = m;
    saveSettings({ mode: m }).catch(() => {});
    this.render();
  }

  private async refine() {
    const text = this.prompt();
    if (!text) {
      this.state = { view: "analyse" };
      return this.render();
    }
    this.state = { view: "loading" };
    this.fab.setAttribute("data-busy", "");
    this.render();
    let reply: RefineReply;
    try {
      reply = await chrome.runtime.sendMessage({ type: "refine", prompt: text, platform: this.adapter.id, mode: this.mode } satisfies Msg);
    } catch {
      reply = { ok: false, code: "network", error: "Couldn't refine this prompt right now. Try again." };
    }
    this.fab.removeAttribute("data-busy");
    if (!reply?.ok) {
      const r = reply as Extract<RefineReply, { ok: false }> | undefined;
      this.state = { view: "error", message: r?.error ?? "Couldn't refine this prompt right now. Try again.", connect: r?.code === "not_connected" || r?.code === "no_permission" || r?.code === "auth" };
    } else {
      this.state = { view: "result", result: reply.result, original: text, replaced: false, editing: false, showDiff: false };
    }
    if (this.panel) this.render();
    else this.open();
  }

  private result(st: Extract<State, { view: "result" }>): Node[] {
    const r = st.result;
    const a = r.analysis;
    const c = r.checks;
    const intentOk = c.intent.ratio >= 0.8;
    const out: Node[] = [];

    out.push(
      h(
        "div",
        { class: "list" },
        a.taskType || a.intent ? h("p", {}, h("span", { class: "eyebrow" }, "Intent "), h("span", {}, a.taskType ? `${a.taskType}` : ""), a.intent ? h("span", { class: "muted" }, a.taskType ? ` · ${a.intent}` : a.intent) : null) : null,
        a.missingContext.length ? h("div", { class: "chips" }, ...a.missingContext.slice(0, 5).map((m) => h("span", { class: "chip", title: m.why }, `+ ${m.item}`))) : null,
        a.ambiguities.length ? h("div", { class: "chips" }, ...a.ambiguities.slice(0, 5).map((m) => h("span", { class: "chip q", title: m.why }, `“${m.phrase}”`))) : null,
      ),
    );

    let editor: HTMLTextAreaElement | null = null;
    if (st.editing) {
      editor = h("textarea", { class: "out", "aria-label": "Edit refined prompt" }) as HTMLTextAreaElement;
      editor.value = r.refined;
      editor.addEventListener("input", () => (r.refined = editor!.value));
      out.push(editor);
    } else if (st.showDiff) {
      const d = h("div", { class: "out diff", "aria-label": "Changes from your prompt" });
      for (const part of wordDiff(st.original, r.refined)) d.append(part.type === "same" ? document.createTextNode(part.text) : h("span", { class: part.type }, part.text));
      out.push(d);
    } else {
      out.push(h("div", { class: "out", tabindex: 0, "aria-label": "Refined prompt" }, r.refined));
    }

    out.push(
      h(
        "div",
        { class: "meta" },
        h("span", { class: intentOk ? "ok" : "warn", title: c.intent.missing.length ? `Not found in the refined prompt: ${c.intent.missing.join(", ")}` : "All key terms from your prompt are kept" }, `Kept ${c.intent.kept}/${c.intent.terms} key terms`),
        h("span", {}, `${c.originalWords} → ${c.refinedWords} words`),
        c.tooLong ? h("span", { class: "warn" }, "longer than a quick edit should be") : null,
        r.model ? h("span", { class: "mono" }, r.model) : null,
      ),
    );
    if (!intentOk && c.intent.missing.length) out.push(h("p", { class: "note" }, `Check your intent was kept: “${c.intent.missing.slice(0, 4).join("”, “")}” no longer appears.`));
    if (st.note) out.push(h("p", { class: "msg", role: "status" }, st.note));

    out.push(
      h(
        "div",
        { class: "row" },
        h("button", { class: "primary", type: "button", style: "flex:1", onclick: () => this.replace(st) }, st.replaced ? "Replaced ✓" : "Replace"),
        h("button", { class: "ghost", type: "button", onclick: () => this.copy(st) }, "Copy"),
      ),
      h(
        "div",
        { class: "row" },
        h("button", { class: "quiet", type: "button", "aria-pressed": String(st.editing), onclick: () => this.update({ ...st, editing: !st.editing, showDiff: false }) }, st.editing ? "Done editing" : "Edit"),
        h("button", { class: "quiet", type: "button", "aria-pressed": String(st.showDiff), onclick: () => this.update({ ...st, showDiff: !st.showDiff, editing: false }) }, st.showDiff ? "Hide changes" : "Changes"),
        h("button", { class: "quiet", type: "button", onclick: () => this.refine() }, "Regenerate"),
        st.replaced ? h("button", { class: "quiet", type: "button", onclick: () => this.undo(st) }, "Undo") : null,
        h("button", { class: "quiet", type: "button", onclick: () => this.update({ view: "analyse" }) }, MODE_LABEL[this.mode] + " ▾"),
      ),
    );

    const details: Node[] = [];
    const toConfirm = [...r.assumptions, ...r.placeholders.map((p) => `Fill in ${p}`)];
    if (toConfirm.length) details.push(h("div", { class: "list" }, h("p", { class: "eyebrow" }, "Confirm"), ...toConfirm.slice(0, 6).map((x) => h("div", { class: "gap" }, h("span", { class: "plus" }, "•"), x))));
    if (r.changes.length) details.push(h("div", { class: "list" }, h("p", { class: "eyebrow" }, "Changed"), ...r.changes.slice(0, 6).map((x) => h("div", { class: "gap", title: x.reason }, h("span", { class: "plus" }, "+"), x.change))));
    if (r.platformNotes.length) details.push(h("div", { class: "list" }, h("p", { class: "eyebrow" }, `Optimised for ${this.adapter.label}`), ...r.platformNotes.slice(0, 4).map((x) => h("p", { class: "note" }, x))));
    if (details.length) out.push(h("details", {}, h("summary", {}, "Why these changes"), h("div", { class: "list", style: "gap:10px" }, ...details)));
    return out;
  }

  private update(next: State) {
    this.state = next;
    this.render();
  }

  private async replace(st: Extract<State, { view: "result" }>) {
    const el = this.composer && this.composer.isConnected ? this.composer : this.adapter.findComposer(document);
    const ok = el ? await this.adapter.write(el, st.result.refined) : false;
    if (ok) this.update({ ...st, replaced: true, note: undefined });
    else {
      const copied = await this.writeClipboard(st.result.refined);
      this.update({ ...st, note: copied ? "We refined your prompt, but couldn't place it in the box. It's copied: paste it in." : "We refined your prompt. Copy it below." });
    }
  }

  private async undo(st: Extract<State, { view: "result" }>) {
    const el = this.composer ?? this.adapter.findComposer(document);
    const ok = el ? await this.adapter.write(el, st.original) : false;
    this.update({ ...st, replaced: !ok, note: ok ? "Your original prompt is back." : "Couldn't restore automatically. Your original is in Changes." });
  }

  private async copy(st: Extract<State, { view: "result" }>) {
    const ok = await this.writeClipboard(st.result.refined);
    this.update({ ...st, note: ok ? "Copied." : "Copy was blocked by the page. Use Edit, then select and copy." });
  }

  private async writeClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  private async disableHere() {
    const s = await getSettings();
    await saveSettings({ disabledHosts: [...new Set([...s.disabledHosts, location.hostname])] });
    this.destroy();
  }
}
