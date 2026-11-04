import { test, expect } from "@playwright/test";
import { firstSelectedId } from "./helpers";

// Editable draft → approval → PDF gate. All model/API calls are mocked so the
// spec proves the UI contract without spending a provider call or touching
// persisted rows.

const draft = {
  id: "tr_e2e",
  version: 1,
  versionCount: 1,
  status: "DRAFT" as const,
  warnings: ["summary_1 marked UNCHANGED but text differs from bullet_1"],
  sections: [
    {
      id: "sec_summary",
      type: "summary",
      title: "Summary",
      items: [
        {
          id: "summary_1",
          kind: "summary",
          fields: { content: "Backend engineer focused on Go." },
          provenance: { sourceIds: ["bullet_1"], change: "REWRITE" },
        },
      ],
    },
    {
      id: "sec_experience",
      type: "experience",
      title: "Experience",
      items: [
        {
          id: "exp_1",
          kind: "experience",
          fields: { title: "Engineer", company: "Acme" },
          provenance: { sourceIds: ["bullet_2"], change: "UNCHANGED" },
        },
      ],
    },
  ],
};

const approved = { ...draft, status: "APPROVED" as const, warnings: [] };

test("draft can be edited, saved, approved, then rendered", async ({
  page,
}) => {
  await page.goto("/");
  const id = await firstSelectedId(page);

  await page.route(`**/api/jobs/${id}/state`, (route) =>
    route.fulfill({
      json: {
        analysis: {
          id: "an_e2e",
          summary: "Fixture analysis.",
          matchedSkills: ["Go"],
          missingSkills: [],
          potentialConcerns: [],
          verdict: "STRONG",
          verdictReasons: ["Relevant backend work"],
        },
        tailored: null,
        versionCount: 0,
        decision: null,
      },
    }),
  );

  let savedContent: string | null = null;
  await page.route(`**/api/jobs/${id}/tailor`, async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const body = req.postDataJSON() as { sections: typeof draft.sections };
      const fields = body.sections[0].items[0].fields as { content?: string };
      savedContent = fields.content ?? null;
      return route.fulfill({
        json: { ...draft, sections: body.sections },
      });
    }
    return route.fulfill({ status: 201, json: { ...draft, cached: false } });
  });

  await page.route(`**/api/jobs/${id}/approve`, (route) =>
    route.fulfill({ json: approved }),
  );

  await page.goto(`/?selected=${id}`);
  await page.getByRole("button", { name: /tailor resume/i }).click();

  await expect(page.getByText("Draft · editable")).toBeVisible();
  await expect(page.getByText(/Review these before approving/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /approve resume/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /render pdf/i })).toHaveCount(
    0,
  );

  const summary = page.getByLabel("content").first();
  await summary.fill("Backend engineer focused on Go and Postgres.");
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  expect(savedContent).toBe("Backend engineer focused on Go and Postgres.");

  await page.getByRole("button", { name: /approve resume/i }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /render pdf/i })).toBeVisible();

  await expect(
    page.getByRole("button", { name: /write cover letter/i }),
  ).toHaveCount(0);
});
