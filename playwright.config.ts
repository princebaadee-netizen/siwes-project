import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// localhost, not 127.0.0.1: Next 14 warns about cross-origin dev requests from
// the raw IP address, and the warning is noise nobody needs in CI logs.
const baseURL = `http://localhost:${PORT}`;

/**
 * Browser tests run against the real Next.js app with the API stubbed in the
 * browser (see tests/e2e/fake-api.ts). That keeps them fast and deterministic
 * and, more importantly, means CI needs no database — the backend talks to a
 * Postgres instance that a GitHub runner does not have.
 *
 * The app is served by `next dev` on its own port so an E2E run never collides
 * with a development server the developer already has open.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
