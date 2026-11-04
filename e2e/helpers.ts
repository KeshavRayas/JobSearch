import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";

// Tracked ids live in the OS temp dir, NOT in the repo: writes under the
// project root make Turbopack HMR recompile mid-run and have been observed
// to coincide with stale dev-server renders. Keyed per full-suite run via
// PLAYWRIGHT_RUN_ID so concurrent invocations never share the file.
function trackFile() {
  const run = process.env.PLAYWRIGHT_RUN_ID ?? "default";
  return path.join(tmpdir(), `jobsearch-e2e-${run}.json`);
}

export function trackFilePath() {
  return trackFile();
}

// Remember a job id whose decision row the suite created so
// globalTeardown can remove it.
export async function trackDecision(jobId: string) {
  const file = trackFile();
  await mkdir(path.dirname(file), { recursive: true });
  let ids: string[] = [];
  try {
    ids = JSON.parse(await readFile(file, "utf8"));
  } catch {
    ids = [];
  }
  if (!ids.includes(jobId)) {
    ids.push(jobId);
    await writeFile(file, JSON.stringify(ids));
  }
}

/** First job card's selected id on the current list. */
export async function firstSelectedId(page: Page): Promise<string> {
  const href = await page
    .locator('a[href*="selected="]')
    .first()
    .getAttribute("href");
  const id = href?.split("selected=")[1]?.split("&")[0];
  if (!id) throw new Error("no job card found");
  return id;
}
