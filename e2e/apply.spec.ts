import { test, expect } from "@playwright/test";
import { firstSelectedId, trackDecision } from "./helpers";

// The job modal is now a compact index card. Analysis, tailoring, and the
// resume live in /apply/[id]; these specs assert the handoff and tracker.

test("detail overlay opens with correct gates", async ({ page }) => {
  await page.goto("/");
  const id = await firstSelectedId(page);
  await page.goto(`/?selected=${id}`);

  await expect(page.getByText("Job detail").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Role facts" })).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: /review & tailor resume|continue application/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Analysis, tailoring, editing/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI Analysis" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Model")).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeVisible();
});

test("apply queues the job without leaving Discover", async ({ page }) => {
  await page.route("**/api/jobs/*/decision", (route) =>
    route.fulfill({ status: 201, json: { status: "QUEUED" } }),
  );
  await page.goto("/");
  const apply = page
    .getByRole("button", { name: "Apply", exact: true })
    .first();
  await apply.click();
  await expect(page.getByText("In your apply queue").first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("queue page lists a queued job and links to its workspace", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const id = await firstSelectedId(page);
  await trackDecision(id);
  const res = await request.post(`/api/jobs/${id}/decision`, {
    data: { status: "QUEUED" },
  });
  expect(res.ok()).toBeTruthy();

  await page.goto("/apply");
  await expect(
    page.getByRole("heading", { name: "Your apply queue." }),
  ).toBeVisible();
  await expect(page.locator(`a[href="/apply/${id}"]`)).toBeVisible();
});

test("save records a decision visible on the tracker", async ({ page }) => {
  await page.goto("/");
  const id = await firstSelectedId(page);
  await trackDecision(id);

  await page.goto(`/?selected=${id}`);
  await expect(page.getByText("Job detail").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("decision-badge")).toHaveText("SAVED", {
    timeout: 20_000,
  });

  await page.goto("/tracker");
  await expect(page.locator(`a[href*="/apply/${id}"]`).first()).toBeVisible();
});

test("liveness probe reports a badge", async ({ page }) => {
  await page.goto("/");
  const id = await firstSelectedId(page);
  await page.goto(`/?selected=${id}`);
  await page.getByRole("button", { name: "CHECK LIVE" }).click();
  await expect(page.getByText(/● (Live|Closed\?)/)).toBeVisible({
    timeout: 30_000,
  });
});
