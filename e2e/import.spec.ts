import { test, expect } from "@playwright/test";

// Import disclosure UI + route gates. Never imports a real URL here
// (writes rows); the write path is covered by unit + manual verification.
test("import disclosure renders with disabled-until-typed submit", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Have a link? Add it").first().click();
  const input = page.getByRole("textbox", { name: /paste a job/i });
  await expect(input).toBeVisible();
  const add = page.getByRole("button", { name: /add/i });
  await expect(add).toBeDisabled();
  await input.fill("https://example.com");
  await expect(add).toBeEnabled();
});

test("import route rejects empty bodies with 400", async ({ request }) => {
  const res = await request.post("/api/jobs/import", { data: {} });
  expect(res.status()).toBe(400);
});

test("import route 422s thin and local URLs without persisting", async ({
  request,
}) => {
  const thin = await request.post("/api/jobs/import", {
    data: { url: "https://example.com" },
  });
  expect(thin.status()).toBe(422);

  const local = await request.post("/api/jobs/import", {
    data: { url: "http://localhost:3000/" },
  });
  expect(local.status()).toBe(422);
  expect((await local.json()).error).toMatch(/local network/);
});
