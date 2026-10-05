import { lintPrompt } from "../../../src/lib/engines/prompt-lint";
import { wordDiff } from "../../../src/lib/refine/intent-check";
import type { Mode } from "../../../src/lib/refine/platforms";
import type { PlatformAdapter } from "../adapters/types";
import { getSettings, saveSettings } from "../services/settings";
import type { Msg, RefineReply, RefineResult } from "../services/types";
import { closeIcon, h, mark } from "../lib/dom";
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
  quick: "Clears up what's vague. Keeps your words.",
  deep: "Adds structure, constraints and a clear goal.",
  expert: "Everything in Deep, tuned for this AI.",
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
  private watchdog = 0;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions | boolean][] = [];

  constructor(private adapter: PlatformAdapter) {
    this.host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646;";
    // Constructed stylesheets aren't subject to the page's style CSP; <style> is the fallback.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      this.shadow.adoptedStyleSheets = [sheet];
    } catch {
      this.shadow.append(h("style", {}, CSS));
    }
    this.shadow.append(this.root);
    this.fab = h("button", { class: "fab", type: "button", "aria-label": "UPSHIFT: refine this prompt (Alt+U)", title: "UPSHIFT  (Alt+U)", onclick: () => this.toggle() }, mark(15), this.badge);
    this.fab.hidden = true;
    this.root.append(this.fab);
  }

  async mount() {
    const s = await getSettings();
    this.mode = s.mode;
    this.liveHints = s.liveHints;
    document.documentElement.append(this.host);
    this.applyTheme();
    this.track();
    // SPA pages mount and remount their composer (and some redraw the whole
    // document); re-find it cheaply and re-attach if our node was removed.
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
    this.watchdog = window.setInterval(() => this.schedule(), 1200);
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
    clearInterval(this.watchdog);
    cancelAnimationFrame(this.raf);
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
    // The extension was updated or removed: this copy is orphaned, step aside.
    if (!chrome.runtime?.id) return this.destroy();
    if (!this.host.isConnected) {
      document.documentElement.append(this.host);
      this.applyTheme();
    }
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
    const fw = this.fab.offsetWidth || 32;
    this.fab.style.top = `${Math.max(4, r.top - fw / 2)}px`;
    this.fab.style.left = `${Math.min(innerWidth - fw - 8, Math.max(8, r.right - fw - 16))}px`;
    if (this.panel) this.placePanel(r);
  }

  /** Match the page: light panel on light sites, dark on dark. */
  private applyTheme() {
    const lum = (el: Element | null) => {
      if (!el) return null;
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (!m || (m.length === 4 && Number(m[3]) === 0)) return null;
      const [r, g, b] = m.map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const l = lum(document.body) ?? lum(document.documentElement);
    const dark = l === null ? matchMedia("(prefers-color-scheme: dark)").matches : l < 0.5;
    this.root.dataset.theme = dark ? "dark" : "light";
  }

  private placePanel(r: DOMRect) {
    const p = this.panel!;
    const width = Math.min(360, innerWidth - 16);
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
      this.fab.setAttribute("aria-label", n ? `UPSHIFT: ${n} things to clarify (Alt+U)` : "UPSHIFT: refine this prompt (Alt+U)");
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
    this.applyTheme();
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
    const nodes: (Node | null)[] = [
      h(
        "div",
        { class: "head" },
        h("span", { class: "brand" }, mark(14), h("span", {}, "UPSHIFT")),
        this.adapter.id === "other" ? null : h("span", { class: "plat" }, this.adapter.label),
        h("button", { class: "x", type: "button", "aria-label": "Close", onclick: () => this.close() }, closeIcon(10)),
      ),
      h("div", { class: "body" }, ...this.body()),
      this.state.view === "analyse" ? h("button", { class: "off", type: "button", "aria-label": `Turn off on ${location.hostname}`, onclick: () => this.disableHere() }, "Turn off on this site") : null,
    ];
    p.replaceChildren(...nodes.filter((n): n is Node => n !== null));
  }

  private body(): Node[] {
    if (!this.composer) return [h("p", { class: "title" }, "Click into the prompt box"), h("p", { class: "muted" }, "Then open UPSHIFT again.")];
    switch (this.state.view) {
      case "loading":
        return [
          h("p", { class: "title", role: "status" }, "Refining"),
          h("div", { class: "skeleton", "aria-hidden": "true" }, h("span", {}), h("span", {}), h("span", {})),
          h("p", { class: "muted" }, MODE_HINT[this.mode]),
        ];
      case "error":
        return [
          h("p", { class: "title" }, "Couldn't refine"),
          h("p", { class: "muted", role: "alert" }, this.state.message),
          this.state.connect
            ? h("button", { class: "primary", type: "button", onclick: () => chrome.runtime.sendMessage({ type: "open-options" } satisfies Msg) }, "Connect")
            : h("button", { class: "primary", type: "button", onclick: () => this.refine() }, "Try again"),
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
    if (!text) return [h("p", { class: "title" }, "Write a prompt first"), h("p", { class: "muted" }, "UPSHIFT works on what's in the prompt box.")];
    const gaps = lintPrompt(text);
    const out: Node[] = [
      h("p", { class: "title" }, gaps.length ? `${gaps.length} ${gaps.length === 1 ? "thing" : "things"} to clarify` : "Looks clear"),
      gaps.length ? h("ul", { class: "gaps" }, ...gaps.map((g) => h("li", { title: g.detail }, g.label))) : h("p", { class: "muted" }, "Refining can still sharpen it."),
    ];
    if (!withAction) return out;
    out.push(
      h(
        "div",
        { class: "seg", role: "radiogroup", "aria-label": "Refinement depth", onkeydown: (e: Event) => this.modeKeys(e as KeyboardEvent) },
        ...(Object.keys(MODE_LABEL) as Mode[]).map((m) =>
          h("button", { type: "button", role: "radio", "aria-checked": String(this.mode === m), tabindex: this.mode === m ? 0 : -1, onclick: () => this.setMode(m) }, MODE_LABEL[m]),
        ),
      ),
      h("p", { class: "muted small" }, MODE_HINT[this.mode]),
      h("button", { class: "primary", type: "button", onclick: () => this.refine() }, "Refine"),
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
    const c = r.checks;
    const intentOk = c.intent.ratio >= 0.8;
    const out: Node[] = [];

    out.push(
      h(
        "div",
        { class: "titlerow" },
        h("p", { class: "title" }, "Refined"),
        h(
          "span",
          { class: `pill ${intentOk ? "ok" : "warn"}`, title: c.intent.missing.length ? `Not in the refined prompt: ${c.intent.missing.join(", ")}` : `All ${c.intent.terms} key terms kept` },
          `${intentOk ? "Intent kept" : "Check intent"}  ${c.intent.kept}/${c.intent.terms}`,
        ),
      ),
    );

    if (st.editing) {
      const editor = h("textarea", { class: "out", "aria-label": "Edit refined prompt" }) as HTMLTextAreaElement;
      editor.value = r.refined;
      editor.addEventListener("input", () => (r.refined = editor.value));
      out.push(editor);
      queueMicrotask(() => editor.focus());
    } else if (st.showDiff) {
      const d = h("div", { class: "out diff", tabindex: 0, "aria-label": "Changes from your prompt" });
      for (const part of wordDiff(st.original, r.refined)) d.append(part.type === "same" ? document.createTextNode(part.text) : h("span", { class: part.type }, part.text));
      out.push(d);
    } else {
      out.push(h("div", { class: "out", tabindex: 0, "aria-label": "Refined prompt" }, r.refined));
    }

    if (!intentOk && c.intent.missing.length) out.push(h("p", { class: "note warn" }, `No longer mentions ${c.intent.missing.slice(0, 3).join(", ")}.`));
    if (c.tooLong) out.push(h("p", { class: "note warn" }, "Longer than a quick edit should be."));
    if (st.note) out.push(h("p", { class: "note", role: "status" }, st.note));

    out.push(
      h(
        "div",
        { class: "actions" },
        st.replaced
          ? h("button", { class: "secondary", type: "button", onclick: () => this.undo(st) }, "Undo")
          : h("button", { class: "primary", type: "button", onclick: () => this.replace(st) }, "Replace"),
        h("button", { class: "secondary", type: "button", onclick: () => this.copy(st) }, "Copy"),
      ),
      h(
        "div",
        { class: "links" },
        h("button", { type: "button", "aria-pressed": String(st.editing), onclick: () => this.update({ ...st, editing: !st.editing, showDiff: false }) }, st.editing ? "Done" : "Edit"),
        h("button", { type: "button", "aria-pressed": String(st.showDiff), onclick: () => this.update({ ...st, showDiff: !st.showDiff, editing: false }) }, "Changes"),
        h("button", { type: "button", onclick: () => this.refine() }, "Regenerate"),
        h("button", { type: "button", onclick: () => this.update({ view: "analyse" }) }, "Back"),
      ),
    );

    const a = r.analysis;
    const section = (title: string, items: { text: string; hint?: string }[]) =>
      items.length ? h("div", { class: "why" }, h("p", { class: "label" }, title), h("ul", { class: "gaps" }, ...items.map((x) => h("li", { title: x.hint ?? "" }, x.text)))) : null;
    const confirm = [...r.assumptions.map((x) => ({ text: x })), ...r.placeholders.map((p) => ({ text: `Fill in ${p}` }))].slice(0, 5);
    const parts = [
      a.intent ? h("p", { class: "muted" }, a.intent) : null,
      section("Added", a.missingContext.slice(0, 5).map((m) => ({ text: m.item, hint: m.why }))),
      section("Changed", r.changes.slice(0, 5).map((x) => ({ text: x.change, hint: x.reason }))),
      section("Please confirm", confirm),
      section(`For ${this.adapter.label}`, r.platformNotes.slice(0, 4).map((x) => ({ text: x }))),
    ].filter((n): n is HTMLDivElement | HTMLParagraphElement => !!n);
    if (parts.length) out.push(h("details", {}, h("summary", {}, "What changed"), h("div", { class: "whylist" }, ...parts)));
    return out;
  }

  private update(next: State) {
    this.state = next;
    this.render();
  }

  private async replace(st: Extract<State, { view: "result" }>) {
    const el = this.composer && this.composer.isConnected ? this.composer : this.adapter.findComposer(document);
    const ok = el ? await this.adapter.write(el, st.result.refined) : false;
    if (ok) this.update({ ...st, replaced: true, note: "Replaced in the prompt box." });
    else {
      const copied = await this.writeClipboard(st.result.refined);
      this.update({ ...st, note: copied ? "Couldn't place it in the prompt box, so it's copied. Paste it in." : "Couldn't place it in the prompt box. Use Copy." });
    }
  }

  private async undo(st: Extract<State, { view: "result" }>) {
    const el = this.composer ?? this.adapter.findComposer(document);
    const ok = el ? await this.adapter.write(el, st.original) : false;
    this.update({ ...st, replaced: !ok, note: ok ? "Your original prompt is back." : "Couldn't restore it. Your original is under Changes." });
  }

  private async copy(st: Extract<State, { view: "result" }>) {
    const ok = await this.writeClipboard(st.result.refined);
    this.update({ ...st, note: ok ? "Copied." : "This page blocked copying. Use Edit, then copy." });
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
