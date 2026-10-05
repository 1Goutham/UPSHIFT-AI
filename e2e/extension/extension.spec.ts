import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

const DIST = path.resolve("extension/dist");
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
  await expect(panel(page)).toContainText(/Vague in \d+ areas?\./);
  await expect(panel(page)).toContainText("· ChatGPT");
  await panel(page).getByRole("button", { name: "Refine prompt" }).click();
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
  await expect(popup.getByText("Connected as Ext")).toBeVisible();
  await expect(popup.getByText("Refinement is on.")).toBeVisible();
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
  await panel(page).getByRole("button", { name: "Refine prompt" }).click();

  await expect(panel(page)).toContainText("website build");
  await expect(panel(page)).toContainText("+ Target audience");
  await expect(panel(page)).toContainText(/Kept \d+\/\d+ key terms/);
  await expect(panel(page).locator(".out")).toContainText("high-contrast dark design");
  await page.screenshot({ path: "test-results/shots/ext-chatgpt-result.png" });

  // Changes view shows a word diff.
  await panel(page).getByRole("button", { name: "Changes" }).click();
  await expect(panel(page).locator(".diff .del").first()).toContainText("cool");

  // Replace writes into the composer and is verified; Undo restores.
  await panel(page).getByRole("button", { name: "Replace" }).click();
  await expect(panel(page).getByRole("button", { name: "Replaced ✓" })).toBeVisible();
  await expect(page.locator("#prompt-textarea")).toContainText("subtle scroll animations");
  await panel(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("#prompt-textarea")).toHaveText(original);
  await expect(panel(page)).toContainText("Your original prompt is back.");

  // Expert notes are labelled with the platform.
  await panel(page).getByText("Why these changes").click();
  await expect(panel(page)).toContainText("Optimised for ChatGPT");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await page.close();
});

test("Grok textarea composer: replace works through the native setter", async () => {
  const page = await ctx.newPage();
  await page.goto("https://grok.com/");
  await page.locator("textarea").fill("write a cool landing page");
  await fab(page).click();
  await expect(panel(page)).toContainText("· Grok");
  await panel(page).getByRole("button", { name: "Refine prompt" }).click();
  await panel(page).getByRole("button", { name: "Replace" }).click();
  await expect(page.locator("textarea")).toHaveValue(/high-contrast landing page/);
  await page.close();
});

test("history is saved only when turned on, and shows in the web app", async () => {
  const id = await extensionId();
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByLabel("Save to history").check();
  await popup.close();
  const page = await ctx.newPage();
  await page.goto("https://grok.com/");
  await page.locator("textarea").fill("summarise this cool article for my team");
  await fab(page).click();
  await panel(page).getByRole("button", { name: "Refine prompt" }).click();
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
