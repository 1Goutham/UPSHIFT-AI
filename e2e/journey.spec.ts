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

  await page.goto("/");
  await shot(page, "01-landing");
  await page.getByRole("link", { name: "Start a project" }).click();
  await page.getByLabel("Name").fill("Ana");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });

  // 1. Project with goal and original prompt.
  await page.getByLabel("Project name").fill("Ana portfolio");
  await page.getByLabel("What do you want to achieve?").fill("A portfolio site so recruiters hiring product designers remember me. Don't use stock photos.");
  await page.getByLabel("Prompt you used or plan to use").fill("Make my portfolio premium, modern and interactive.");
  await shot(page, "02-new-project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/app\/p\//);

  // 2. Brief → suggested requirements → accept.
  await page.getByRole("button", { name: "Build brief" }).click();
  await expect(page.getByText(/suggested\. Review before they count/)).toBeVisible();
  await shot(page, "03-brief-suggested");
  await page.getByRole("button", { name: "Accept all" }).click();
  await expect(page.getByText(/Acceptance checklist · \d+ confirmed/)).toBeVisible();
  await expect(page.getByText(/suggested\. Review/)).toHaveCount(0);

  // Add a requirement through the composer.
  await page.getByLabel("New requirement").fill("Contact section with an email field");
  await page.getByLabel("New requirement").press("Enter");
  await expect(page.getByText("Requirement added and confirmed")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "Contact section with an email field" })).toBeVisible();

  // 3. Prompt gaps + structured improvement (no model).
  await page.getByRole("tab", { name: /Prompt/ }).click();
  await expect(page.getByText(/gaps? found/)).toBeVisible();
  await expect(page.getByText("Undefined quality words")).toBeVisible();
  await page.getByRole("button", { name: "Improve prompt" }).click();
  await expect(page.getByText("assembled from your confirmed brief, no model")).toBeVisible();
  await expect(page.locator(".prompt-out").filter({ hasText: "[MUST]" }).first()).toBeVisible();
  await shot(page, "04-prompt");

  // 4. Add v1 URL → audit with the real browser.
  await page.getByRole("tab", { name: /Outputs/ }).click();
  await page.getByLabel("Public URL").fill(`${FIXTURE}/v1`);
  await page.getByRole("button", { name: "Add and audit" }).click();
  await expect(page.getByText(/Auditing version 1/)).toBeVisible();
  await expect(page.getByText("Requirement coverage")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("No placeholder content").first()).toBeVisible();
  await expect(page.getByText("Rendered in a real browser")).toBeVisible();
  await shot(page, "05-audit-v1");

  // 5. Correction prompt from preselected issues.
  await page.getByRole("button", { name: "Create correction prompt" }).click();
  await expect(page.getByText(/Fix these issues \(in this order\)/)).toBeVisible();
  await expect(page.getByText(/Keep working|Constraints/).first()).toBeVisible();
  await shot(page, "06-correction");

  // 6. v2 → compare shows improvements.
  await page.getByRole("button", { name: /Add v2/ }).click();
  await page.getByLabel("Public URL").fill(`${FIXTURE}/v2`);
  await page.getByLabel(/What changed/).fill("Applied the correction prompt");
  await page.getByRole("button", { name: "Add and audit" }).click();
  await expect(page.getByText("Requirement coverage")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("tab", { name: /Compare/ }).click();
  const improved = page.locator("dt", { hasText: "Improved" }).locator("xpath=following-sibling::dd");
  await expect(improved).not.toHaveText("0");
  await shot(page, "07-compare");

  // 7. Human review of an untested requirement.
  await page.getByRole("tab", { name: /Outputs/ }).click();
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
  await expect(page.getByRole("tab", { name: /Outputs/ })).toHaveAttribute("aria-selected", "true");

  if (!mobile) {
    await page.goto("/app/insights");
    await expect(page.getByText("Your most frequent prompt gaps")).toBeVisible();
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
  await page.getByLabel("Project name").fill("Upload test");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/app\/p\//);
  await page.getByRole("tab", { name: /Outputs/ }).click();
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
  await page.getByLabel("Project name").fill("Secret project");
  await page.getByRole("button", { name: "Create project" }).click();
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
