import { test, expect } from "@playwright/test";
import { firstSelectedId, trackDecision } from "./helpers";

// Detail overlay gates + the SAVE → tracker loop (manual Chrome pass).
// Never clicks ANALYZE (would spend a model call); asserts the gates instead.

test("detail overlay opens with correct gates", async ({ page }) => {
  await page.goto("/");
  const id = await firstSelectedId(page);
  await page.goto(`/?selected=${id}`);

  await expect(page.getByRole("heading", { name: "AI Analysis" })).toBeVisible();
  await expect(page.getByRole("button", { name: /analyze job/i })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Role facts" }),
  ).toBeVisible();
  await expect(page.getByText("Add your AI key")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /tailor resume/i }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /write cover letter/i }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /prepare interview/i }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "OPEN APPLICATION" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
});

test("save records a decision visible on the tracker", async ({ page }) => {
  await page.goto("/");
  const id = await firstSelectedId(page);
  await trackDecision(id);

  await page.goto(`/?selected=${id}`);
  await expect(page.getByText("Job Detail").first()).toBeVisible({
    timeout: 30_000,
  });
  // Footer buttons are sentence case ("Save"); exact match is
  // case-sensitive in Playwright, so match the real label.
  // Buttons stay disabled until hydration (mounted gate) — Playwright
  // auto-waits for enablement, so this click can't race hydration.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Unambiguous: the decision badge (data-testid), not the "result is
  // saved" paragraph elsewhere on the page.
  await expect(page.getByTestId("decision-badge")).toHaveText("SAVED", {
    timeout: 20_000,
  });

  await page.goto("/tracker");
  await expect(
    page.locator(`a[href*="selected=${id}"]`).first(),
  ).toBeVisible();
});

test("liveness probe reports a badge", async ({ page }) => {
  await page.goto("/");
  const id = await firstSelectedId(page);
  await page.goto(`/?selected=${id}`);
  await page.getByRole("button", { name: "CHECK LIVE" }).click();
  // Either outcome is a working probe; the badge is the contract.
  await expect(page.getByText(/● (Live|Closed\?)/)).toBeVisible({
    timeout: 30_000,
  });
});
