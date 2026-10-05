import type { PlatformId } from "../../../src/lib/refine/platforms";
import type { PlatformAdapter } from "./types";

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  if (r.width < 40 || r.height < 16) return false;
  const s = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !s || (s.visibility !== "hidden" && s.display !== "none");
};

export const isEditable = (el: Element | null): el is HTMLElement =>
  !!el && (el instanceof el.ownerDocument.defaultView!.HTMLTextAreaElement || (el as HTMLElement).isContentEditable || el.getAttribute("contenteditable") === "true");

/** Last resort: the focused editor, else the largest visible editor on the page. */
export function genericComposer(doc: Document): HTMLElement | null {
  const active = doc.activeElement;
  if (isEditable(active) && visible(active)) return active;
  const candidates = [...doc.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"], [contenteditable=""]')].filter(visible);
  candidates.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return rb.width * rb.height - ra.width * ra.height;
  });
  return candidates[0] ?? null;
}

const norm = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

export function readEditor(el: HTMLElement): string {
  if (el instanceof el.ownerDocument.defaultView!.HTMLTextAreaElement) return el.value;
  // innerText keeps line breaks between paragraphs; fall back to textContent where layout is unavailable.
  return (el.innerText || el.textContent || "").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Write text the way a user would, so the site's editor framework notices:
 *  - textarea: native value setter + input event (React-controlled inputs)
 *  - contenteditable: select all + insertText, then a synthetic paste as a
 *    fallback (ProseMirror and Quill both handle paste)
 * Then read back and compare.
 */
export async function writeEditor(el: HTMLElement, text: string): Promise<boolean> {
  const win = el.ownerDocument.defaultView!;
  const doc = el.ownerDocument;
  el.focus();
  if (el instanceof win.HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(el, text);
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
    return norm(el.value) === norm(text);
  }
  const selectAll = () => {
    const sel = doc.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(range);
  };
  selectAll();
  let ok = false;
  try {
    ok = typeof doc.execCommand === "function" && doc.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  await new Promise((r) => setTimeout(r, 30));
  if (ok && norm(readEditor(el)) === norm(text)) return true;

  try {
    selectAll();
    const dt = new win.DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(new win.ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  } catch {
    /* DataTransfer unavailable: fall through to the honest result */
  }
  await new Promise((r) => setTimeout(r, 30));
  return norm(readEditor(el)) === norm(text);
}

/** An adapter from an ordered list of selectors, with the generic fallback. */
export function selectorAdapter(id: PlatformId, label: string, selectors: string[]): PlatformAdapter {
  return {
    id,
    label,
    findComposer(doc) {
      for (const sel of selectors) {
        const el = [...doc.querySelectorAll<HTMLElement>(sel)].find((e) => isEditable(e) && visible(e));
        if (el) return el;
      }
      return genericComposer(doc);
    },
    read: readEditor,
    write: writeEditor,
  };
}
