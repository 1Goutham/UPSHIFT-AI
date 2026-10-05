// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { detectPlatform } from "../../../src/lib/refine/platforms";
import { adapterFor, genericAdapter } from "./index";

// jsdom has no layout; give elements a size so visibility checks behave like a browser.
function sized<T extends HTMLElement>(el: T, w = 600, hgt = 60): T {
  el.getBoundingClientRect = () => ({ width: w, height: hgt, top: 500, left: 100, right: 100 + w, bottom: 500 + hgt, x: 100, y: 500, toJSON() {} }) as DOMRect;
  return el;
}

describe("platform detection", () => {
  it.each([
    ["chatgpt.com", "chatgpt"],
    ["chat.openai.com", "chatgpt"],
    ["claude.ai", "claude"],
    ["gemini.google.com", "gemini"],
    ["grok.com", "grok"],
    ["www.grok.com", "grok"],
  ])("%s → %s", (host, id) => expect(detectPlatform(host)).toBe(id));
  it.each(["evil-chatgpt.com", "chatgpt.com.attacker.io", "example.com", "google.com"])("rejects %s", (host) => expect(detectPlatform(host)).toBeNull());
  it("has no adapter off supported sites", () => expect(adapterFor("example.com")).toBeNull());
});

describe("adapters", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("ChatGPT: finds #prompt-textarea over other editors", () => {
    const other = sized(document.createElement("textarea"), 900, 300);
    const composer = sized(document.createElement("div"));
    composer.id = "prompt-textarea";
    composer.setAttribute("contenteditable", "true");
    document.body.append(other, composer);
    expect(adapterFor("chatgpt.com")!.findComposer(document)).toBe(composer);
  });

  it("Gemini: finds the Quill editor inside rich-textarea", () => {
    const wrap = document.createElement("rich-textarea");
    const ed = sized(document.createElement("div"));
    ed.className = "ql-editor";
    ed.setAttribute("contenteditable", "true");
    wrap.append(ed);
    document.body.append(wrap);
    expect(adapterFor("gemini.google.com")!.findComposer(document)).toBe(ed);
  });

  it("Claude: finds the ProseMirror editor", () => {
    const ed = sized(document.createElement("div"));
    ed.className = "ProseMirror";
    ed.setAttribute("contenteditable", "true");
    document.body.append(ed);
    expect(adapterFor("claude.ai")!.findComposer(document)).toBe(ed);
  });

  it("falls back to the largest visible editor when site selectors miss", () => {
    const small = sized(document.createElement("textarea"), 100, 20);
    const big = sized(document.createElement("textarea"), 800, 120);
    const hidden = document.createElement("textarea"); // no size → invisible
    document.body.append(small, big, hidden);
    expect(adapterFor("grok.com")!.findComposer(document)).toBe(big);
    expect(genericAdapter.findComposer(document)).toBe(big);
  });

  it("returns null when there is no prompt box", () => {
    expect(adapterFor("grok.com")!.findComposer(document)).toBeNull();
  });

  it("writes to a textarea through the native setter and verifies it", async () => {
    const ta = sized(document.createElement("textarea"));
    let inputEvents = 0;
    ta.addEventListener("input", () => inputEvents++);
    document.body.append(ta);
    const a = adapterFor("grok.com")!;
    expect(await a.write(ta, "Refined prompt")).toBe(true);
    expect(a.read(ta)).toBe("Refined prompt");
    expect(inputEvents).toBe(1);
  });

  it("reports failure honestly when a contenteditable rejects the insert", async () => {
    const ed = sized(document.createElement("div"));
    ed.setAttribute("contenteditable", "true");
    ed.textContent = "original";
    document.body.append(ed);
    // jsdom implements neither insertText nor clipboard paste handling, like an editor that ignores both.
    const ok = await adapterFor("claude.ai")!.write(ed, "refined");
    expect(ok).toBe(false);
    expect(ed.textContent).toBe("original");
  });

  it("reports success when the editor accepts a paste", async () => {
    const ed = sized(document.createElement("div"));
    ed.setAttribute("contenteditable", "true");
    ed.textContent = "original";
    // Behave like ProseMirror: handle paste by replacing content.
    ed.addEventListener("paste", (e) => {
      e.preventDefault();
      ed.textContent = (e as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
    });
    document.body.append(ed);
    // jsdom lacks DataTransfer/ClipboardEvent constructors; provide minimal ones.
    const w = window as unknown as Record<string, unknown>;
    w.DataTransfer = class {
      private d = new Map<string, string>();
      setData(k: string, v: string) {
        this.d.set(k, v);
      }
      getData(k: string) {
        return this.d.get(k) ?? "";
      }
    };
    w.ClipboardEvent = class extends Event {
      clipboardData: unknown;
      constructor(t: string, init: { clipboardData: unknown } & EventInit) {
        super(t, init);
        this.clipboardData = init.clipboardData;
      }
    };
    expect(await adapterFor("claude.ai")!.write(ed, "refined")).toBe(true);
    expect(ed.textContent).toBe("refined");
  });
});
