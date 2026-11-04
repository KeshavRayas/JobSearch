import { test, expect } from "@playwright/test";
import { trackDecision } from "./helpers";

test("tracker renders hero and a seeded board card", async ({
  page,
  request,
}) => {
  // Self-sufficient: seed our own decision via the API (second card, to
  // avoid colliding with apply.spec's save target) instead of depending
  // on another spec's side effects.
  await page.goto("/");
  const cards = page.locator('a[href*="selected="]');
  const count = await cards.count();
  const href = await cards.nth(count > 1 ? 1 : 0).getAttribute("href");
  const id = href?.split("selected=")[1]?.split("&")[0];
  expect(id).toBeTruthy();
  await trackDecision(id!);

  const res = await request.post(`/api/jobs/${id}/decision`, {
    data: { status: "SKIPPED" },
  });
  expect(res.ok()).toBeTruthy();

  await page.goto("/tracker");
  await expect(
    page.getByRole("heading", { name: "Where things stand." }),
  ).toBeVisible();
  await expect(page.locator(`a[href*="selected=${id}"]`).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Discover" })).toBeVisible();
});

test("resumes page renders the saved list", async ({ page }) => {
  await page.goto("/resumes");
  await expect(
    page.getByRole("heading", { name: "Resumes" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /new resume/i })).toBeVisible();
});
