import { adapterFor } from "../adapters";
import { getSettings } from "../services/settings";
import type { Msg } from "../services/types";
import type { Overlay } from "./overlay";

/**
 * Entry point on supported AI sites. Does almost nothing until needed: it
 * checks the site and the user's per-site switch, then mounts the small
 * overlay. Nothing is read or sent until the user interacts.
 */
(async () => {
  const adapter = adapterFor(location.hostname);
  if (!adapter) return;

  let overlay: Overlay | null = null;
  let starting = false;
  const start = async () => {
    if (overlay || starting) return;
    starting = true;
    const { Overlay } = await import("./overlay");
    overlay = new Overlay(adapter);
    await overlay.mount();
    starting = false;
  };
  const stop = () => {
    overlay?.destroy();
    overlay = null;
  };

  chrome.runtime.onMessage.addListener((msg: Msg, sender) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg.type === "toggle") overlay?.toggle();
  });

  // The per-site switch can change from the panel or the popup; follow it live.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.disabledHosts) return;
    const hosts = (changes.disabledHosts.newValue as string[] | undefined) ?? [];
    if (hosts.includes(location.hostname)) stop();
    else start();
  });

  const settings = await getSettings();
  if (!settings.disabledHosts.includes(location.hostname)) await start();
})();
