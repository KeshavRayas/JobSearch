import { test, expect } from "@playwright/test";

// Proves the settings form round-trips through the API and survives a reload.
// Restores the previous profile in `finally` so the shared dev database is
// left exactly as it was found. Writes a screenshot artifact on success.
test("profile settings save and persist", async ({ page, request }) => {
  const initialRes = await request.get("/api/profile");
  expect(initialRes.ok()).toBeTruthy();
  const { profile: original } = await initialRes.json();

  const stamp = Date.now();
  const testName = `E2E Profile ${stamp}`;
  const testSkill = `Playwright${stamp}`;

  try {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Make it yours." }),
    ).toBeVisible();

    await page.getByLabel("Name").fill(testName);

    const skills = page.getByLabel("Skills");
    await skills.fill(testSkill);
    await skills.press("Enter");
    await expect(
      page.getByRole("button", { name: `Remove ${testSkill}` }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");

    // Reload proves it came back from Postgres, not from component state.
    await page.reload();
    await expect(page.getByLabel("Name")).toHaveValue(testName);
    await expect(
      page.getByRole("button", { name: `Remove ${testSkill}` }),
    ).toBeVisible();

    const savedRes = await request.get("/api/profile");
    const { profile: saved } = await savedRes.json();
    expect(saved.name).toBe(testName);
    expect(saved.skills).toContain(testSkill);

    await page.screenshot({
      path: "test-results/profile-settings.png",
      fullPage: true,
    });
  } finally {
    const restored = await request.put("/api/profile", {
      data: {
        name: original.name,
        email: original.email,
        phone: original.phone,
        linkedin: original.linkedin,
        github: original.github,
        skills: original.skills,
        minSalary: original.minSalary,
        locations: original.locations,
        workModes: original.workModes,
        dealbreakers: original.dealbreakers,
        preferredRoleFamilies: original.preferredRoleFamilies,
        vetoedRoleFamilies: original.vetoedRoleFamilies,
        openToRemote: original.openToRemote,
        baseResumeId: original.baseResumeId,
      },
    });
    expect(restored.ok()).toBeTruthy();
  }
});
