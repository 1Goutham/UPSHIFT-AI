import { defineConfig } from "@playwright/test";

/**
 * Extension end-to-end: loads the real dev build of the extension into
 * Chromium, against an UPSHIFT server whose model provider points at the
 * fake OpenAI-compatible upstream in e2e/fixtures/server.mjs.
 *
 *   UPSHIFT_EXT_DEV=1 node extension/build.mjs
 *   UPSHIFT_CHROMIUM_PATH=/path/to/chrome npx playwright test -c playwright.extension.config.ts
 */
const PORT = 3201;
export default defineConfig({
  testDir: "./e2e/extension",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: [
    { command: "node e2e/fixtures/server.mjs", port: 4556, env: { FIXTURE_PORT: "4556" }, reuseExistingServer: true },
    {
      command: `npx next dev -p ${PORT}`,
      port: PORT,
      timeout: 120_000,
      reuseExistingServer: true,
      env: {
        PGLITE_DIR: ".data/e2e-ext-pglite",
        UPSHIFT_STORAGE_DIR: ".data/e2e-ext-uploads",
        XAI_API_KEY: "fake-key",
        XAI_API_BASE: "http://127.0.0.1:4556/v1",
        ANTHROPIC_API_KEY: "",
        UPSHIFT_AUTH_RATE_LIMIT: "200",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
