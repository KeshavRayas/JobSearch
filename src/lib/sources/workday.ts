import type { JobSource } from "./interface";
import type { RawJob } from "@/lib/types";
import { CURATED_COMPANIES } from "@/lib/constants";
import { fetchWithTimeout, runBatched } from "@/lib/utils";

// ─── Workday CxS public API ──────────────────────────────────────────────────
// Undocumented but public per-tenant JSON feeds (no auth):
//   POST https://{host}/wday/cxs/{tenant}/{board}/jobs
//   { appliedFacets: {}, limit: 20, offset: 0, searchText: "" }
// limit is hard-capped at 20 server-side. Full HTML descriptions come from a
// second call: GET .../job/{slug} -> { jobPostingInfo: { jobDescription } }.
// atsBoard convention for workday rows: "<tenantHost>/<board>", e.g.
// "walmart.wd504.myworkdayjobs.com/WalmartExternal".

const BOARD_BATCH_SIZE = 3;
const DETAIL_BATCH_SIZE = 10;
const PAGE_LIMIT = 20;
const MAX_PAGES = 5;

type WorkdayPosting = {
  title?: unknown;
  externalPath?: unknown;
  locationsText?: unknown;
  postedOn?: unknown;
  bulletFields?: unknown;
};

export function parseWorkdayPostedOn(
  postedOn: unknown,
  now = Date.now(),
): Date | undefined {
  if (typeof postedOn !== "string") return undefined;
  const text = postedOn.trim().toLowerCase();
  if (text === "posted today") return new Date(now);
  if (text === "posted yesterday") return new Date(now - 86_400_000);
  const days = text.match(/^posted (\d+)\+? days? ago$/);
  if (days) {
    // "30+ days ago" maps past the 30d stale threshold so ingestion
    // rejects it instead of storing an invisible (unsearchable) row.
    const n = Number(days[1]) + (text.includes("+") ? 1 : 0);
    return new Date(now - n * 86_400_000);
  }
  return undefined;
}

export function workdayTenantFromHost(host: string): string {
  return host.split(".")[0];
}

export function mapWorkdayPosting(
  posting: WorkdayPosting,
  company: { name: string; companyType: "STARTUP" | "MNC" },
  host: string,
  board: string,
  description: string,
): RawJob | null {
  const externalPath =
    typeof posting.externalPath === "string" ? posting.externalPath : "";
  const reqIds = Array.isArray(posting.bulletFields)
    ? posting.bulletFields.filter((x): x is string => typeof x === "string")
    : [];
  const externalId = reqIds[0] ?? externalPath.split("_").pop() ?? "";
  if (!externalId || !externalPath) return null;

  const locationsText =
    typeof posting.locationsText === "string" ? posting.locationsText : "";
  const location =
    locationsText || reqIds.slice(1).join(" ") || undefined;
  const title = typeof posting.title === "string" ? posting.title : "";

  return {
    externalId,
    title,
    description,
    companyName: company.name,
    companyType: company.companyType,
    location,
    remote: /remote/i.test(`${title} ${locationsText}`),
    postedAt: parseWorkdayPostedOn(posting.postedOn),
    applyUrl: `https://${host}/en-US/${board}${externalPath}`,
  };
}

async function fetchBoardJobs(
  host: string,
  board: string,
  tenant: string,
  company: { name: string; companyType: "STARTUP" | "MNC" },
): Promise<RawJob[]> {
  const results: RawJob[] = [];
  const base = `https://${host}/wday/cxs/${tenant}/${board}`;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchWithTimeout(`${base}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appliedFacets: {},
        limit: PAGE_LIMIT,
        offset: page * PAGE_LIMIT,
        searchText: "",
      }),
      timeout: 10_000,
    });
    if (!res.ok) return results;

    const data = await res.json();
    const postings = (
      Array.isArray(data.jobPostings) ? data.jobPostings : []
    ) as WorkdayPosting[];
    if (postings.length === 0) break;

    // Pre-filter stale by list date BEFORE the expensive detail fetch.
    const fresh = postings.filter((p) => {
      const postedAt = parseWorkdayPostedOn(p.postedOn);
      if (!postedAt) return true;
      return Date.now() - postedAt.getTime() <= 30 * 86_400_000;
    });

    await runBatched(fresh, DETAIL_BATCH_SIZE, async (posting) => {
      const slug =
        typeof posting.externalPath === "string"
          ? posting.externalPath.replace(/^\/job\//, "")
          : "";
      if (!slug) return;
      const detail = await fetchWithTimeout(`${base}/job/${slug}`, {
        timeout: 10_000,
      });
      if (!detail.ok) return;
      const detailData = await detail.json();
      const info = detailData.jobPostingInfo ?? {};
      const raw = mapWorkdayPosting(
        posting,
        company,
        host,
        board,
        typeof info.jobDescription === "string" ? info.jobDescription : "",
      );
      if (raw) results.push(raw);
    });

    if (postings.length < PAGE_LIMIT) break;
  }

  return results;
}

export class WorkdaySource implements JobSource {
  readonly name = "workday";

  async fetchJobs(): Promise<RawJob[]> {
    const companies = CURATED_COMPANIES.filter(
      (c) => c.atsType === "workday" && c.atsBoard?.includes("/"),
    );
    const results: RawJob[] = [];

    await runBatched(companies, BOARD_BATCH_SIZE, async (company) => {
      const [host, board] = (company.atsBoard as string).split("/");
      if (!host || !board) return;
      try {
        const jobs = await fetchBoardJobs(
          host,
          board,
          workdayTenantFromHost(host),
          company,
        );
        results.push(...jobs);
      } catch {
        // Per-board failures are recorded by the pipeline's SourceSync;
        // never let one tenant sink the whole run.
      }
    });

    return results;
  }
}
