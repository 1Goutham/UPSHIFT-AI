import { detectPlatform, type PlatformId } from "../../../src/lib/refine/platforms";
import { genericComposer, readEditor, selectorAdapter, writeEditor } from "./base";
import type { PlatformAdapter } from "./types";

/**
 * Site selectors. These track each site's current markup and are expected to
 * need updates when the sites change; every adapter falls back to "the
 * focused / largest editor on the page".
 */
const ADAPTERS: Record<Exclude<PlatformId, "other">, PlatformAdapter> = {
  chatgpt: selectorAdapter("chatgpt", "ChatGPT", ["#prompt-textarea", 'form [contenteditable="true"]', "form textarea"]),
  claude: selectorAdapter("claude", "Claude", ['div.ProseMirror[contenteditable="true"]', 'fieldset [contenteditable="true"]']),
  gemini: selectorAdapter("gemini", "Gemini", ['rich-textarea .ql-editor[contenteditable="true"]', '.ql-editor[contenteditable="true"]']),
  grok: selectorAdapter("grok", "Grok", ['form textarea', 'textarea[aria-label]', 'form [contenteditable="true"]']),
};

export const genericAdapter: PlatformAdapter = { id: "other", label: "this page", findComposer: genericComposer, read: readEditor, write: writeEditor };

export function adapterFor(hostname: string): PlatformAdapter | null {
  const id = detectPlatform(hostname);
  return id && id !== "other" ? ADAPTERS[id] : null;
}

export type { PlatformAdapter };
