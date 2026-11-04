import { test, expect } from "@playwright/test";

// Mirrors the manual Chrome pass: hero, counts, cards, disclosures.
test("homepage renders the calm shell with jobs", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What do you want next?" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: /react bangalore/i })).toBeVisible();

  const cards = page.locator('a[href*="selected="]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);

  await expect(page.getByRole("button", { name: "Remote" })).toBeVisible();
  await expect(page.getByText("More filters").first()).toBeVisible();
  await expect(page.getByText("Have a link? Add it").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Tracker" })).toBeVisible();
});

test("remote pill filters the list and shows Clear", async ({ page }) => {
  await page.goto("/");
  const total = await page.locator('a[href*="selected="]').count();
  await page.getByRole("button", { name: "Remote", exact: true }).click();
  await expect(page).toHaveURL(/workMode=REMOTE/);
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
  const filtered = await page.locator('a[href*="selected="]').count();
  expect(filtered).toBeLessThanOrEqual(total);
});

test("search narrows results with a results line", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: /react bangalore/i }).fill("Go");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=Go/);
  await expect(page.getByText(/Results for/)).toBeVisible();
});

test("skill pill with count applies the skills param", async ({ page }) => {
  await page.goto("/");
  await page.getByText("More filters").first().click();
  const pill = page.getByRole("button", { name: /^Python/ });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page).toHaveURL(/skills=Python/);
});

test("gibberish search shows the calm empty state", async ({ page }) => {
  await page.goto("/?q=zzzznonexistent");
  await expect(page.getByText("Nothing matches — yet.")).toBeVisible();
  await expect(page.getByText(/softer search or clear/)).toBeVisible();
});
