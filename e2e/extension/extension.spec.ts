import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

const DIST = path.resolve("extension/dist-dev");
const SERVER = "http://localhost:3201";

// Stand-ins for the AI sites: same composer markup patterns, served locally
// through request routing so the content script runs on the real hostnames.
const CHATGPT = `<!doctype html><html><body style="background:#212121;color:#eee;font-family:sans-serif">
<main style="height:80vh"></main>
<form style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);width:720px;background:#303030;border-radius:24px;padding:16px">
<div id="prompt-textarea" contenteditable="true" class="ProseMirror" style="min-height:48px;outline:none"></div>
<button type="button">Send</button></form></body></html>`;
const GROK = `<!doctype html><html><body style="background:#000;color:#eee">
<form style="position:fixed;bottom:24px;left:20%;width:60%"><textarea aria-label="Ask Grok anything" style="width:100%;height:80px"></textarea></form></body></html>`;

let ctx: BrowserContext;
let token = "";

async function makeToken(page: Page) {
  const email = `ext-${Date.now()}@example.com`;
  const r = await page.request.post(`${SERVER}/api/auth/signup`, { data: { name: "Ext", email, password: "correct-horse-battery" } });
  expect(r.ok()).toBeTruthy();
  const t = await page.request.post(`${SERVER}/api/ext/tokens`, { data: { label: "Test" } });
  return (await t.json()).token as string;
}

test.beforeAll(async () => {
  ctx = await chromium.launchPersistentContext("", {
    executablePath: process.env.UPSHIFT_CHROMIUM_PATH,
    headless: true,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--no-sandbox"],
  });
  await ctx.route("https://chatgpt.com/**", (r) => r.fulfill({ contentType: "text/html", body: CHATGPT }));
  await ctx.route("https://grok.com/**", (r) => r.fulfill({ contentType: "text/html", body: GROK }));
  const page = await ctx.newPage();
  token = await makeToken(page);
  await page.close();
});
test.afterAll(async () => ctx?.close());

async function extensionId() {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent("serviceworker");
  return new URL(sw.url()).host;
}

const fab = (page: Page) => page.locator("upshift-root").locator("button.fab");
const panel = (page: Page) => page.locator("upshift-root").locator(".panel");

test("not connected: analysis works locally, refine asks to connect", async () => {
  const page = await ctx.newPage();
  await page.goto("https://chatgpt.com/");
  await page.locator("#prompt-textarea").click();
  await page.keyboard.type("Build me a portfolio website with a cool dark design and some animations.");
  await expect(fab(page).locator(".badge")).toHaveText(/\d+/);
  await fab(page).click();
  await expect(panel(page)).toContainText(/\d+ things? to clarify/);
  await expect(panel(page).locator(".plat")).toHaveText("ChatGPT");
  await panel(page).getByRole("button", { name: "Refine", exact: true }).click();
  await expect(panel(page)).toContainText("Connect UPSHIFT to refine.");
  await page.close();
});

test("connect in the popup, then refine, replace and undo on ChatGPT", async () => {
  const id = await extensionId();
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByLabel("UPSHIFT server").fill(SERVER);
  await popup.getByLabel("Extension token").fill(token);
  await popup.getByRole("button", { name: "Connect" }).click();
  await expect(popup.getByText("Ext", { exact: true })).toBeVisible();
  await expect(popup.getByText("Connected", { exact: true })).toBeVisible();
  await popup.screenshot({ path: "test-results/shots/ext-popup.png" });
  await popup.close();

  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("https://chatgpt.com/");
  const original = "Build me a portfolio website with a cool dark design and some animations.";
  await page.locator("#prompt-textarea").click();
  await page.keyboard.type(original);
  await page.keyboard.press("Alt+U").catch(() => {});
  if (!(await panel(page).isVisible())) await fab(page).click();

  // Expert mode via keyboard on the radio group.
  await panel(page).getByRole("radio", { name: "Quick" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(panel(page).getByRole("radio", { name: "Expert" })).toHaveAttribute("aria-checked", "true");
  await panel(page).getByRole("button", { name: "Refine", exact: true }).click();

  // The refined prompt streams in while the model is still writing.
  await expect(panel(page).locator(".out.live")).toContainText("Build me a portfolio");
  await expect(panel(page).locator(".pill")).toHaveText(/Intent kept\s+\d+\/\d+/);
  await expect(panel(page).locator(".out")).toContainText("high-contrast dark design");
  await page.screenshot({ path: "test-results/shots/ext-chatgpt-result.png" });

  // Changes view shows a word diff.
  await panel(page).getByRole("button", { name: "Changes" }).click();
  await expect(panel(page).locator(".diff .del").first()).toContainText("cool");

  // Replace writes into the composer and is verified; Undo restores.
  await panel(page).getByRole("button", { name: "Replace" }).click();
  await expect(panel(page)).toContainText("Replaced in the prompt box.");
  await expect(page.locator("#prompt-textarea")).toContainText("subtle scroll animations");
  await panel(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("#prompt-textarea")).toHaveText(original);
  await expect(panel(page)).toContainText("Your original prompt is back.");

  // Expert notes are labelled with the platform.
  await panel(page).getByText("What changed").click();
  await expect(panel(page)).toContainText("Target audience");
  await expect(panel(page)).toContainText("For ChatGPT");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await page.close();
});

test("comes back if the page redraws and removes it", async () => {
  const page = await ctx.newPage();
  await page.goto("https://chatgpt.com/");
  await expect(fab(page)).toBeVisible();
  // Frameworks that re-render the whole document drop foreign nodes.
  await page.evaluate(() => document.querySelectorAll("upshift-root").forEach((n) => n.remove()));
  await expect(page.locator("upshift-root")).toHaveCount(1);
  await expect(fab(page)).toBeVisible();
  await page.close();
});

test("the button can be dragged anywhere, remembers its spot, and docks again on double-click", async () => {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("https://chatgpt.com/");
  const docked = (await fab(page).boundingBox())!;
  await page.mouse.move(docked.x + 16, docked.y + 16);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 8 });
  await page.mouse.move(200, 150, { steps: 8 });
  await page.mouse.up();
  const moved = (await fab(page).boundingBox())!;
  expect(Math.abs(moved.x + 16 - 200)).toBeLessThan(4);
  expect(Math.abs(moved.y + 16 - 150)).toBeLessThan(4);
  // A drag is not a click: the panel stays closed.
  await expect(panel(page)).toHaveCount(0);
  // A click opens the panel next to the button.
  await fab(page).click();
  await expect(panel(page)).toBeVisible();
  const p = (await panel(page).boundingBox())!;
  expect(p.y).toBeGreaterThan(moved.y);
  await page.keyboard.press("Escape");

  // Remembered after a reload.
  await page.reload();
  // (within a few px: the button zooms slightly while the mouse is over it)
  await page.mouse.move(5, 5);
  await expect.poll(async () => Math.abs(((await fab(page).boundingBox())?.x ?? 0) - moved.x)).toBeLessThan(3);
  // Double-click docks it back on the prompt box.
  await fab(page).dblclick();
  await page.mouse.move(5, 5);
  await expect.poll(async () => Math.abs(((await fab(page).boundingBox())?.x ?? 0) - docked.x)).toBeLessThan(3);
  await page.close();
});

test("Grok textarea composer: replace works through the native setter", async () => {
  const page = await ctx.newPage();
  await page.goto("https://grok.com/");
  await page.locator("textarea").fill("write a cool landing page");
  await fab(page).click();
  await expect(panel(page).locator(".plat")).toHaveText("Grok");
  await panel(page).getByRole("button", { name: "Refine", exact: true }).click();
  await panel(page).getByRole("button", { name: "Replace" }).click();
  await expect(page.locator("textarea")).toHaveValue(/high-contrast landing page/);
  await page.close();
});

test("history is saved only when turned on, and shows in the web app", async () => {
  const id = await extensionId();
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByLabel("Save history").check();
  await popup.close();
  const page = await ctx.newPage();
  await page.goto("https://grok.com/");
  await page.locator("textarea").fill("summarise this cool article for my team");
  await fab(page).click();
  await panel(page).getByRole("button", { name: "Refine", exact: true }).click();
  await expect(panel(page).locator(".out")).toContainText("high-contrast article");
  // The signed-in web session (same user as the token) now sees exactly this one, from the extension.
  const list = await (await page.request.get(`${SERVER}/api/refinements`)).json();
  expect(list.refinements).toHaveLength(1);
  expect(list.refinements[0]).toMatchObject({ source: "extension", platform: "grok", original: "summarise this cool article for my team" });
  await page.close();
});

test("turning UPSHIFT off on a site removes it there", async () => {
  const page = await ctx.newPage();
  await page.goto("https://chatgpt.com/");
  await page.locator("#prompt-textarea").click();
  await page.keyboard.type("hello there friend");
  await fab(page).click();
  await panel(page).getByRole("button", { name: "Turn off on chatgpt.com" }).click();
  await expect(page.locator("upshift-root")).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.locator("upshift-root")).toHaveCount(0);
  // Turn it back on from the popup.
  const id = await extensionId();
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole("button", { name: "Turn on" }).click();
  await popup.close();
  await expect(page.locator("upshift-root")).toHaveCount(1);
  await page.close();
});

test("install or update attaches to tabs that are already open, without a refresh", async () => {
  const page = await ctx.newPage();
  await page.goto("https://chatgpt.com/");
  await expect(fab(page)).toBeVisible();
  // What runs on install or update: inject into open AI tabs. A copy already
  // running there retires, so the page ends up with exactly one working button.
  const [sw] = ctx.serviceWorkers();
  const attached = await sw.evaluate(() => (globalThis as unknown as { __upshiftAttach: () => Promise<number> }).__upshiftAttach());
  expect(attached).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => document.querySelectorAll("upshift-root").length), { timeout: 10_000 }).toBe(1);
  await page.locator("#prompt-textarea").click();
  await page.keyboard.type("write a cool story");
  await fab(page).click();
  await expect(panel(page)).toContainText(/to clarify|Looks clear/);
  await page.close();
});

test("web Prompt Lab uses the same engine", async () => {
  const page = await ctx.newPage();
  await page.goto(`${SERVER}/app/refine`);
  await page.getByLabel("Prompt").fill("Build me a cool dashboard for my team");
  await expect(page.getByText(/Vague in \d+ areas?/)).toBeVisible();
  await page.getByRole("radio", { name: "deep" }).click();
  await page.getByRole("button", { name: "Refine" }).click();
  await expect(page.getByText(/kept \d+\/\d+ key terms/)).toBeVisible();
  await expect(page.locator(".prompt-out").first()).toContainText("high-contrast dashboard");
  await page.getByRole("tab", { name: "Changes" }).click();
  await expect(page.locator(".prompt-out .line-through").first()).toContainText("cool");
  await page.screenshot({ path: "test-results/shots/web-refine.png", fullPage: true });
  await page.close();
});
