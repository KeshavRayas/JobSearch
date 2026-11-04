// Removes rows the suite created: ApplicationDecision rows tracked by job id
// and the deterministic job/company fixtures from global-setup. Uses
// node-postgres directly: the generated Prisma client ships ESM (import.meta)
// which the CJS teardown can't load. Never deletes pre-existing data.
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import "dotenv/config";

function runFile(kind: "e2e" | "e2e-seed") {
  const run = process.env.PLAYWRIGHT_RUN_ID ?? "default";
  return path.join(tmpdir(), `jobsearch-${kind}-${run}.json`);
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function teardown() {
  const decisionFile = runFile("e2e");
  const seedFile = runFile("e2e-seed");
  const decisions = await readJson<string[]>(decisionFile, []);
  const seeded = await readJson<{ jobs: string[]; companies: string[] }>(
    seedFile,
    { jobs: [], companies: [] },
  );

  try {
    if (process.env.DATABASE_URL) {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        if (decisions.length > 0) {
          await client.query(
            'DELETE FROM "ApplicationDecision" WHERE "jobId" = ANY($1)',
            [decisions],
          );
        }
        if (seeded.jobs.length > 0) {
          await client.query('DELETE FROM "Job" WHERE id = ANY($1)', [
            seeded.jobs,
          ]);
        }
        if (seeded.companies.length > 0) {
          await client.query('DELETE FROM "Company" WHERE id = ANY($1)', [
            seeded.companies,
          ]);
        }
      } finally {
        await client.end();
      }
    }
  } finally {
    await rm(decisionFile, { force: true });
    await rm(seedFile, { force: true });
  }
}

export default teardown;
