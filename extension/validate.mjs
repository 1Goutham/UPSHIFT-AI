// Validates the built extension: manifest shape, minimal permissions, files
// present, and no remote code or HTML injection in the bundles.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), process.argv[2] ?? "dist");
const errors = [];
const m = JSON.parse(await fs.readFile(path.join(dist, "manifest.json"), "utf8"));

if (m.manifest_version !== 3) errors.push("manifest_version must be 3");
// scripting: re-attach to AI tabs already open when the extension is installed or updated.
const allowedPerms = new Set(["storage", "scripting"]);
for (const p of m.permissions ?? []) if (!allowedPerms.has(p)) errors.push(`unexpected permission: ${p}`);
const hosts = new Set(["https://chatgpt.com/*", "https://chat.openai.com/*", "https://claude.ai/*", "https://gemini.google.com/*", "https://grok.com/*"]);
for (const cs of m.content_scripts ?? []) for (const u of cs.matches) if (!hosts.has(u)) errors.push(`content script on unexpected site: ${u}`);
// Required host access is limited to the same five sites the content script runs on.
for (const u of m.host_permissions ?? []) {
  if (hosts.has(u)) continue;
  if (/^http:\/\/(localhost|127\.0\.0\.1)\/\*$/.test(u)) {
    if (!process.env.ALLOW_DEV_HOSTS) errors.push(`dev host permission in a production build: ${u}`);
  } else errors.push(`required host permission not allowed: ${u}`);
}

const files = [m.background?.service_worker, m.action?.default_popup, m.options_ui?.page?.split("?")[0], ...Object.values(m.icons ?? {}), ...(m.content_scripts ?? []).flatMap((c) => c.js)];
for (const f of files) {
  try {
    await fs.access(path.join(dist, f));
  } catch {
    errors.push(`missing file: ${f}`);
  }
}
for (const f of ["content.js", "background.js", "popup.js"]) {
  const src = await fs.readFile(path.join(dist, f), "utf8");
  if (/\binnerHTML\s*=|outerHTML\s*=|insertAdjacentHTML\(/.test(src)) errors.push(`${f}: HTML injection API used`);
  if (/\beval\(|new Function\(/.test(src)) errors.push(`${f}: dynamic code evaluation`);
  if (/<script[^>]+src=["']https?:/i.test(src) || /importScripts\(\s*["']https?:/.test(src)) errors.push(`${f}: remote code`);
}
const html = await fs.readFile(path.join(dist, "popup.html"), "utf8");
if (/<script(?![^>]*src="popup\.js")/i.test(html) || /https?:\/\//.test(html.replace(/<!doctype[^>]*>/i, ""))) errors.push("popup.html: inline or remote script/resource");

if (errors.length) {
  console.error("extension validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`extension valid: MV3, permissions [${(m.permissions ?? []).join(", ")}], ${m.content_scripts[0].matches.length} sites${process.env.ALLOW_DEV_HOSTS ? " (dev)" : ""}`);
