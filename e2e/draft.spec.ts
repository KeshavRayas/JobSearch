import { test, expect } from "@playwright/test";
import { firstSelectedId } from "./helpers";

// Full-screen workspace: green/red change map → inline edit → save → approve
// → application link unlocked. All model/API calls are mocked.

const base = {
  id: "res_base",
  title: "Base resume",
  content: {
    sections: [
      {
        id: "base_sum",
        type: "summary",
        title: "Summary",
        items: [
          {
            id: "summary_1",
            content: "Backend engineer focused on Go.",
          },
        ],
      },
      {
        id: "base_exp",
        type: "experience",
        title: "Experience",
        items: [
          {
            id: "exp_1",
            title: "Engineer",
            company: "Acme",
            startDate: "Feb 2026",
            current: true,
            bulletPoints: ["Built APIs with Go."],
          },
        ],
      },
    ],
  },
};

const initialSections = [
  {
    id: "sec_summary",
    type: "summary",
    title: "Summary",
    items: [
      {
        id: "summary_1",
        kind: "summary",
        fields: {
          content: "Backend engineer focused on Go and Postgres at scale.",
        },
        provenance: { sourceIds: ["summary_1"], change: "REWRITE" },
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
        fields: {
          title: "Engineer",
          company: "Acme",
          startDate: "Feb 2026",
          current: true,
          bulletPoints: ["Built reliable APIs with Go and Postgres."],
        },
        provenance: { sourceIds: ["exp_1_b1"], change: "REWRITE" },
      },
    ],
  },
];

test("workspace shows changes, edits, saves, and approves", async ({
  page,
}) => {
  await page.goto("/");
  const id = await firstSelectedId(page);

  let sections = initialSections;
  let approved = false;
  let savedContent: string | null = null;

  const job = {
    id,
    title: "Test Engineer",
    description: "Build Go services.",
    applyUrl: "https://example.com/apply",
    location: "Remote",
    workMode: "REMOTE",
    jobType: "FULL_TIME",
    experience: "ENTRY",
    source: "MANUAL",
    postedAt: new Date().toISOString(),
    skills: ["Go", "Postgres"],
    salaryMin: null,
    salaryMax: null,
    salaryCurr: null,
    company: {
      name: "Acme",
      slug: "acme",
      companyType: "STARTUP",
    },
  };

  const state = () => ({
    job,
    analysis: {
      summary: "Fixture analysis.",
      matchedSkills: ["Go"],
      missingSkills: ["Postgres"],
      requiredSkills: ["Go", "Postgres"],
      potentialConcerns: [],
      verdict: "POSSIBLE",
      verdictReasons: ["Relevant backend work"],
    },
    tailored: {
      id: "tr_e2e",
      version: 1,
      baseResumeId: base.id,
      status: approved ? "APPROVED" : "DRAFT",
      warnings: [],
      sections,
      renderStatus: "PENDING",
      atsStatus: "PENDING",
    },
    base,
    decision: { status: "QUEUED" },
    profile: {
      name: "Test Candidate",
      email: "test@example.com",
      phone: null,
      linkedin: null,
      github: null,
      location: "Remote",
    },
    queue: [
      {
        id,
        title: job.title,
        companyName: "Acme",
        location: "Remote",
        status: "QUEUED",
      },
    ],
  });

  await page.route(`**/api/jobs/${id}/state`, (route) =>
    route.fulfill({ json: state() }),
  );

  await page.route(`**/api/jobs/${id}/tailor`, async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const body = req.postDataJSON() as { sections: typeof initialSections };
      sections = body.sections;
      const fields = body.sections[0].items[0].fields as { content?: string };
      savedContent = fields.content ?? null;
      return route.fulfill({ json: { ...state().tailored, sections } });
    }
    return route.fulfill({
      status: 201,
      json: { ...state().tailored, sections },
    });
  });

  await page.route(`**/api/jobs/${id}/approve`, (route) => {
    approved = true;
    return route.fulfill({ json: { ...state().tailored } });
  });

  await page.goto(`/apply/${id}`);

  await expect(page.getByText("Resume", { exact: true })).toBeVisible();
  await expect(page.locator(".resume-add").first()).toBeVisible();
  await expect(page.locator(".resume-del").first()).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const summary = page.getByRole("textbox", {
    name: "Summary",
    exact: true,
  });
  await summary.click();
  await summary.fill(
    "Backend engineer focused on Go, Postgres, and distributed systems.",
  );
  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  expect(savedContent).toBe(
    "Backend engineer focused on Go, Postgres, and distributed systems.",
  );

  await page.getByRole("button", { name: "Approve resume" }).click();
  await expect(
    page.getByRole("button", { name: /open application/i }),
  ).toBeEnabled({ timeout: 15_000 });

  await page.getByRole("button", { name: "Changes", exact: true }).click();
  await expect(page.locator(".resume-add").first()).toBeVisible();
});
