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

  // A newer copy of this script (after an update or reinstall) retires the old one.
  const RETIRE = "upshift:retire";
  document.dispatchEvent(new CustomEvent(RETIRE));

  let overlay: Overlay | null = null;
  let starting = false;
  let retired = false;
  const start = async () => {
    if (overlay || starting || retired) return;
    starting = true;
    const { Overlay } = await import("./overlay");
    if (!retired) {
      overlay = new Overlay(adapter);
      await overlay.mount();
    }
    starting = false;
  };
  const stop = () => {
    overlay?.destroy();
    overlay = null;
  };
  document.addEventListener(RETIRE, () => {
    retired = true;
    stop();
  }, { once: true });

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
