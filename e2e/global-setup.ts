import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import "dotenv/config";

// ─── E2E fixture ─────────────────────────────────────────────────────────────
// The suite needs visible job cards, but the dev database may be empty (or
// freshly migrated). Seed three deterministic jobs only when nothing visible
// exists, and record their ids so globalTeardown can remove them. Real data is
// never touched.
//
// Visibility matches searchJobs: ACTIVE, classificationScore ≥ 0.70,
// postedAt within 30 days.

function seedFile() {
  const run = process.env.PLAYWRIGHT_RUN_ID ?? "default";
  return path.join(tmpdir(), `jobsearch-e2e-seed-${run}.json`);
}

const JOBS = [
  {
    id: "e2e-job-backend",
    externalId: "e2e-backend-1",
    title: "Software Engineer, Backend",
    description:
      "Build and operate backend services in Go and Python. Work with PostgreSQL, Redis, and distributed systems. This is a deterministic fixture posting used by the end-to-end suite.",
    location: "Bangalore, India",
    workMode: "REMOTE",
    jobType: "FULL_TIME",
    experience: "ENTRY",
    skills: ["Python", "Go", "PostgreSQL", "Redis"],
    score: 0.92,
    url: "https://example.com/jobs/e2e-backend",
  },
  {
    id: "e2e-job-platform",
    externalId: "e2e-platform-1",
    title: "Platform Engineer",
    description:
      "Own infrastructure and developer tooling. Docker, AWS, CI/CD, and Linux. This is a deterministic fixture posting used by the end-to-end suite.",
    location: "Bangalore, India",
    workMode: "HYBRID",
    jobType: "FULL_TIME",
    experience: "MID",
    skills: ["Go", "Docker", "AWS", "Linux"],
    score: 0.86,
    url: "https://example.com/jobs/e2e-platform",
  },
  {
    id: "e2e-job-fullstack",
    externalId: "e2e-fullstack-1",
    title: "Full Stack Developer",
    description:
      "Ship product across TypeScript, React, and Node.js. This is a deterministic fixture posting used by the end-to-end suite.",
    location: "Remote",
    workMode: "REMOTE",
    jobType: "FULL_TIME",
    experience: "ENTRY",
    skills: ["TypeScript", "React", "Node.js"],
    score: 0.81,
    url: "https://example.com/jobs/e2e-fullstack",
  },
] as const;

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const visible = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "Job"
       WHERE "status" = 'ACTIVE'
         AND "classificationScore" >= 0.70
         AND "postedAt" IS NOT NULL
         AND DATE_PART('day', NOW() - "postedAt") <= 30`,
    );
    if (visible.rows[0].n > 0) return;

    const companyId = "e2e-company-lab";
    await client.query(
      `INSERT INTO "Company" (id, name, slug, "companyType", website)
       VALUES ($1, 'E2E Labs', 'e2e-labs', 'STARTUP', 'https://example.com')
       ON CONFLICT (slug) DO NOTHING`,
      [companyId],
    );
    const company = await client.query<{ id: string }>(
      `SELECT id FROM "Company" WHERE slug = 'e2e-labs'`,
    );
    const actualCompanyId = company.rows[0].id;

    for (const job of JOBS) {
      await client.query(
        `INSERT INTO "Job"
           (id, "externalId", source, title, description, "applyUrl", "companyId",
            location, "workMode", "jobType", experience, skills, "postedAt",
            "scrapedAt", status, "classificationScore", "sourceScore", "searchVector")
         VALUES ($1, $2, 'MANUAL', $3, $4, $5, $6, $7, $8::"WorkMode",
                 $9::"JobType", $10::"ExperienceLevel", $11::text[], NOW(),
                 NOW(), 'ACTIVE', $12, 0, to_tsvector('english', $3 || ' ' || $4))
         ON CONFLICT (id) DO NOTHING`,
        [
          job.id,
          job.externalId,
          job.title,
          job.description,
          job.url,
          actualCompanyId,
          job.location,
          job.workMode,
          job.jobType,
          job.experience,
          job.skills,
          job.score,
        ],
      );
    }

    const file = seedFile();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        jobs: JOBS.map((j) => j.id),
        companies: [actualCompanyId],
      }),
    );
  } finally {
    await client.end();
  }
}
