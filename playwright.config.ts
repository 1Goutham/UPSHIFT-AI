import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against `next dev` with a local fixture site. Private
 * URLs are allowed only because NODE_ENV is not production here.
 */
const PORT = 3200;
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.UPSHIFT_CHROMIUM_PATH ? { executablePath: process.env.UPSHIFT_CHROMIUM_PATH } : {},
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    { command: "node e2e/fixtures/server.mjs", port: 4556, env: { FIXTURE_PORT: "4556" }, reuseExistingServer: true },
    {
      command: `npx next dev -p ${PORT}`,
      port: PORT,
      timeout: 120_000,
      reuseExistingServer: true,
      env: {
        PGLITE_DIR: ".data/e2e-pglite",
        UPSHIFT_STORAGE_DIR: ".data/e2e-uploads",
        UPSHIFT_ALLOW_PRIVATE_URLS: "true",
        UPSHIFT_CHROMIUM_NO_SANDBOX: process.env.UPSHIFT_CHROMIUM_NO_SANDBOX ?? "",
        UPSHIFT_CHROMIUM_PATH: process.env.UPSHIFT_CHROMIUM_PATH ?? "",
        ANTHROPIC_API_KEY: "",
        XAI_API_KEY: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
