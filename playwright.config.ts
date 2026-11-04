import { defineConfig, devices } from "@playwright/test";

// Server renders take seconds on first compile; filters re-render
// server-side (~2-4s observed in manual Chrome passes). Generous budgets.
export default defineConfig({
  testDir: "./e2e",
  // Serial: a single Turbopack dev server serves all tests, and specs share
  // one dev database. Parallel workers starve SSR and cross-pollute state.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev --port 3000 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
  },
  globalTeardown: "./e2e/teardown.ts",
});
