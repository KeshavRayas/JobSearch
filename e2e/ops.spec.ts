import { test, expect } from "@playwright/test";

// The local-deployment contract: health is machine-readable, ops is human.

test("health reports a usable install", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.database.connected).toBe(true);
  expect(body.jobs.total).toBeGreaterThan(0);
  expect(body.profile.configured).toBe(true);
  expect(body.provider.name).toBeTruthy();
});

test("ops page shows checks and ingestion history", async ({ page }) => {
  await page.goto("/ops");
  await expect(
    page.getByRole("heading", { name: "Is it working?" }),
  ).toBeVisible();
  await expect(page.getByText("Visible jobs")).toBeVisible();
  await expect(page.getByText("Recent ingestion")).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
});
