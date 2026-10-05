import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";

const FIXTURE = "http://127.0.0.1:4556";
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/shots/${test.info().project.name}-${name}.png`, fullPage: true });

/**
 * The core loop with no AI provider configured: everything here must work
 * from deterministic checks and the real browser alone.
 */
test("core journey: brief → prompt → audit → correction → v2 → compare", async ({ page }) => {
  const email = `e2e-${Date.now()}-${test.info().project.name}@example.com`;
  const mobile = test.info().project.name === "mobile";

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Ana");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });

  // 1. Project with goal and original prompt (the secondary start).
  await page.getByRole("button", { name: /Start from a brief/ }).click();
  await page.getByLabel("Goal").fill("A portfolio site so recruiters hiring product designers remember me. Don't use stock photos.");
  await page.getByLabel("Your prompt (optional)").fill("Make my portfolio premium, modern and interactive.");
  await page.getByText("More options").click();
  await page.getByLabel("Name", { exact: true }).fill("Ana portfolio");
  await page.getByRole("combobox", { name: "AI tool" }).fill("Lovable");
  await shot(page, "02-new-project");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/app\/p\//);

  // 2. The brief builds itself → suggested requirements → accept.
  await expect(page.getByText(/\d+ suggested$/)).toBeVisible();
  await shot(page, "03-brief-suggested");
  await page.getByRole("button", { name: "Accept all" }).click();
  await expect(page.getByText(/Checklist · \d+/)).toBeVisible();
  await expect(page.getByText(/\d+ suggested$/)).toHaveCount(0);

  // Add a requirement through the composer.
  await page.getByLabel("New requirement").fill("Contact section with an email field");
  await page.getByLabel("New requirement").press("Enter");
  await expect(page.getByText("Requirement added and confirmed")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "Contact section with an email field" })).toBeVisible();

  // 3. Prompt gaps + structured improvement (no model).
  await page.getByRole("tab", { name: /Prompt/ }).click();
  await expect(page.getByText(/^\d+ gaps?$/)).toBeVisible();
  await expect(page.getByText("Undefined quality words")).toBeVisible();
  await page.getByRole("button", { name: "Improve prompt" }).click();
  await expect(page.getByText(/from your brief ·/)).toBeVisible();
  await expect(page.locator(".prompt-out").filter({ hasText: "[MUST]" }).first()).toBeVisible();
  await shot(page, "04-prompt");

  // 4. Add v1 URL → audit with the real browser.
  await page.getByRole("tab", { name: /Audit/ }).click();
  await page.getByRole("textbox", { name: "URL" }).fill(`${FIXTURE}/v1`);
  await page.getByRole("button", { name: "Add and audit" }).click();
  await expect(page.getByText(/Auditing version 1/)).toBeVisible();
  await expect(page.getByText(/\d+\/\d+ met/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("No placeholder content").first()).toBeVisible();
  await expect(page.getByText("Screenshots")).toBeVisible();
  // Deeper checks: crawl, mobile navigation, axe-core.
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByText("Internal links work")).toBeVisible();
  await expect(page.getByText("Navigation works on phones")).toBeVisible();
  await expect(page.getByText("Automated accessibility rules (WCAG A/AA)")).toBeVisible();
  await page.getByRole("tab", { name: /Issues/ }).click();
  await shot(page, "05-audit-v1");

  // 5. Correction prompt from preselected issues.
  await page.getByRole("button", { name: "Create correction prompt" }).click();
  // Built with Lovable: split into small messages.
  await expect(page.getByText(/Message 1 of \d+/)).toBeVisible();
  await expect(page.getByText(/Fix these, in order/).first()).toBeVisible();
  await shot(page, "06-correction");

  // 6. v2 → compare shows improvements.
  await page.getByRole("button", { name: /Add v2/ }).click();
  // Prefilled from v1; point it at the fixed page.
  await expect(page.getByRole("textbox", { name: "URL" })).toHaveValue(`${FIXTURE}/v1`);
  await page.getByRole("textbox", { name: "URL" }).fill(`${FIXTURE}/v2`);
  await page.getByLabel("Note (optional)").fill("Applied the correction prompt");
  await page.getByRole("button", { name: "Add and audit" }).click();
  await expect(page.getByText(/\d+\/\d+ met/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: /vs v1/ })).toContainText("↑");
  await expect(page.getByRole("button", { name: /vs v1/ })).toContainText(/fix \d+\/\d+/);
  await page.getByRole("tab", { name: /Compare/ }).click();
  const improved = page.locator("dt", { hasText: "Improved" }).locator("xpath=following-sibling::dd");
  await expect(improved).not.toHaveText("0");
  await page.getByRole("tab", { name: "Difference" }).first().click();
  await expect(page.getByText(/bright = changed/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Side by side" }).first().click();
  await shot(page, "07-compare");

  // 7. Human review of an untested requirement.
  await page.getByRole("tab", { name: /Audit/ }).click();
  await page.getByRole("tab", { name: /Requirements \d+/ }).click();
  const met = page.getByRole("button", { name: "Met", exact: true }).first();
  if (await met.isVisible()) {
    await met.click();
    await expect(page.getByText("you", { exact: true }).first()).toBeVisible();
  }

  // 8. History keeps the evidence; reopen the project from the list.
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText(/Audit finished for v2/)).toBeVisible();
  await shot(page, "08-history");
  await page.goto("/app");
  await page.getByRole("link", { name: /Ana portfolio/ }).first().click();
  await expect(page.getByRole("tab", { name: /Audit/ })).toHaveAttribute("aria-selected", "true");

  if (!mobile) {
    await page.goto("/app/insights");
    await expect(page.getByText("Fix success")).toBeVisible();
    await expect(page.getByText(/issues resolved in the next version/)).toBeVisible();
    await shot(page, "09-insights");
    await page.goto("/app/settings");
    await expect(page.getByText("Not configured")).toBeVisible();
  }
});

test("uploads are validated by content, not file name", async ({ page }) => {
  test.skip(test.info().project.name === "mobile");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("U");
  await page.getByLabel("Email").fill(`up-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });
  await page.getByRole("button", { name: /Start from a brief/ }).click();
  await page.getByLabel("Goal").fill("Upload test");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/app\/p\//);
  await page.getByRole("tab", { name: /Audit/ }).click();
  await page.getByRole("tab", { name: "Upload file" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await page.getByRole("button", { name: "Add and audit" }).click();
  await expect(page.getByText(/Unsupported file type|does not look like text/)).toBeVisible();

  // A real PNG goes through.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.locator('input[type="file"]').setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Add and audit" }).click();
  await expect(page.getByText("Image file").first()).toBeVisible({ timeout: 60_000 });
});

test("projects are isolated between accounts", async ({ page, request }) => {
  test.skip(test.info().project.name === "mobile");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("A");
  await page.getByLabel("Email").fill(`iso-a-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });
  await page.getByRole("button", { name: /Start from a brief/ }).click();
  await page.getByLabel("Goal").fill("Secret project");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/app\/p\//);
  const projectUrl = page.url();
  const id = projectUrl.split("/app/p/")[1].split("?")[0];

  // A different account cannot read or delete it.
  const other = await request.post("/api/auth/signup", { data: { name: "B", email: `iso-b-${Date.now()}@example.com`, password: "correct-horse-battery" } });
  expect(other.ok()).toBeTruthy();
  expect((await request.get(`/api/projects/${id}`)).status()).toBe(404);
  expect((await request.delete(`/api/projects/${id}`)).status()).toBe(404);
  // Anonymous requests are refused.
  const anon = await playwrightRequest.newContext({ baseURL: test.info().project.use.baseURL });
  expect((await anon.get(`/api/projects/${id}`)).status()).toBe(401);
  await anon.dispose();
});

test("reference images can be added and removed in the brief", async ({ page }) => {
  test.skip(test.info().project.name === "mobile");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("R");
  await page.getByLabel("Email").fill(`ref-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.getByRole("button", { name: /Start from a brief/ }).click();
  await page.getByLabel("Goal").fill("With references");
  // Picked before the project exists; uploaded on create.
  await page.locator('input[type="file"]').setInputFiles({ name: "mood.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/app\/p\//);
  await expect(page.getByRole("img", { name: "mood.png" })).toBeVisible();
  // Add another from the brief, then remove the first.
  await page.locator('input[type="file"]').setInputFiles({ name: "brand.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("img", { name: "brand.png" })).toBeVisible();
  await page.getByRole("img", { name: "mood.png" }).hover();
  await page.getByRole("button", { name: "Remove mood.png" }).click();
  await expect(page.getByRole("img", { name: "mood.png" })).toHaveCount(0);
  // Non-images are refused by content.
  await page.locator('input[type="file"]').setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.getByText(/must be PNG, JPEG, WebP or GIF/)).toBeVisible();
});

test("a shared report is public, read-only and revocable", async ({ page, browser }) => {
  test.skip(test.info().project.name === "mobile");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("S");
  await page.getByLabel("Email").fill(`share-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });
  await page.getByRole("button", { name: /Start from a brief/ }).click();
  await page.getByLabel("Goal").fill("Shared site check");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/app\/p\//);
  const id = page.url().split("/app/p/")[1].split("?")[0];

  const res = await page.request.post(`/api/projects/${id}/share`);
  const { path } = await res.json();
  expect(path).toMatch(/^\/r\/[A-Za-z0-9_-]+$/);

  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto(path);
  await expect(pub.getByRole("heading", { name: "Shared site check" })).toBeVisible();
  await expect(pub.getByText("read-only report")).toBeVisible();
  expect((await pub.request.get(`/api/projects/${id}`)).status()).toBe(401);

  await page.request.delete(`/api/projects/${id}/share`);
  const gone = await pub.goto(path);
  expect(gone?.status()).toBe(404);
  await anon.close();
});

test("password change keeps you signed in and the new password works", async ({ page }) => {
  test.skip(test.info().project.name === "mobile");
  const email = `pw-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("P");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });
  await page.goto("/app/settings");
  await page.getByLabel("Current password").fill("correct-horse-battery");
  await page.getByLabel("New password").fill("another-long-pass");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  const bad = await page.request.post("/api/auth/login", { data: { email, password: "correct-horse-battery" } });
  expect(bad.status()).toBe(401);
});

test("free audit without an account, then save it by signing up", async ({ page }) => {
  await page.goto("/");
  await shot(page, "00-landing");
  await page.getByLabel("Website URL").fill(`${FIXTURE}/v2`);
  await page.getByRole("button", { name: "Audit" }).click();
  await expect(page).toHaveURL(/\/app\/p\/.*tab=outputs/, { timeout: 60_000 });
  await expect(page.getByText(/Auditing/).first()).toBeVisible();
  await expect(page.getByText("Screenshots")).toBeVisible({ timeout: 120_000 });
  await shot(page, "00-guest-audit");
  // Save: the guest becomes a real account, and the audit stays.
  if (test.info().project.name === "mobile") await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Save your work" }).click();
  await expect(page.getByRole("heading", { name: /Create account/ })).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("G");
  await page.getByLabel("Email").fill(`guest-${Date.now()}-${test.info().project.name}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });
  await expect(page.getByRole("link", { name: /127\.0\.0\.1/ }).first()).toBeVisible();
});

test("re-audit on deploy creates the next version", async ({ page }) => {
  test.skip(test.info().project.name === "mobile");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("H");
  await page.getByLabel("Email").fill(`hook-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });
  await page.getByLabel("Website URL").fill(`${FIXTURE}/v2`);
  await page.getByRole("button", { name: "Audit" }).click();
  await expect(page.getByText("Screenshots")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Re-audit on deploy" }).click();
  await expect(page.locator("dialog pre")).toContainText("/api/hooks/");
  const cmd = await page.locator("dialog pre").textContent();
  const url = cmd!.split(" ").pop()!;
  expect(url).toMatch(/\/api\/hooks\/[A-Za-z0-9_-]+$/);
  const ci = await playwrightRequest.newContext();
  const res = await ci.post(url);
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).version).toBe(2);
  expect((await ci.post(url.replace(/[^/]+$/, "nope-nope-nope-nope-nope"))).status()).toBe(404);
  await ci.dispose();
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(page.getByText(/v2/).first()).toBeVisible();
});
