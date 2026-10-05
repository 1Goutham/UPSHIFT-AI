// Renders the extension icons from the UPSHIFT asterisk (one-off; PNGs are committed).
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "icons");
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#000"/><path d="M16 5v22M5 16h22M8.2 8.2l15.6 15.6M23.8 8.2 8.2 23.8" stroke="#9DFF50" stroke-width="${s <= 16 ? 3.2 : 2.4}" stroke-linecap="round"/></svg>`;
const b = await chromium.launch({ executablePath: process.env.UPSHIFT_CHROMIUM_PATH, args: ["--no-sandbox"] });
const p = await b.newPage();
for (const s of [16, 32, 48, 128]) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg(s)}</body></html>`);
  await p.screenshot({ path: path.join(dir, `${s}.png`), omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
}
await b.close();
console.log("icons written");
