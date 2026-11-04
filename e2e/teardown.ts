// Removes ApplicationDecision rows the suite created (tracked by job id in
// a temp file — see e2e/helpers.ts). Uses node-postgres directly: the
// generated Prisma client ships ESM (import.meta) which the CJS teardown
// can't load.
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import "dotenv/config";

async function teardown() {
  const run = process.env.PLAYWRIGHT_RUN_ID ?? "default";
  const file = path.join(tmpdir(), `jobsearch-e2e-${run}.json`);
  let ids: string[] = [];
  try {
    ids = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return;
  }
  try {
    if (ids.length > 0 && process.env.DATABASE_URL) {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query(
        'DELETE FROM "ApplicationDecision" WHERE "jobId" = ANY($1)',
        [ids],
      );
      await client.end();
    }
  } finally {
    await rm(file, { force: true });
  }
}

export default teardown;
