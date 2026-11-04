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
    // Dedicated port: port 3000 is commonly occupied by another local Next.js
    // app, and reusing a foreign server silently runs the suite against it.
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev --port 3100 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
  },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/teardown.ts",
});
