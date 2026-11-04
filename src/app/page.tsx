import { Suspense } from "react";
import { after } from "next/server";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { JobFilters } from "@/components/JobFilters";
import { JobBrowser } from "@/components/JobBrowser";
import {
  searchJobs,
  getSignalSkillCounts,
} from "@/lib/repositories/jobs.repository";
import { logSearchEvent } from "@/lib/repositories/search.repository";
import type { JobFilters as Filters } from "@/lib/types";
import { RefreshButton } from "@/components/RefreshButton";
import { JobImport } from "@/components/JobImport";
import { SiteNav } from "@/components/SiteNav";

type SearchParams = Promise<{
  q?: string;
  location?: string;
  workMode?: string;
  companyTypes?: string;
  skills?: string;
  jobType?: string;
  experience?: string;
  daysOld?: string;
  sources?: string;
  page?: string;
  selected?: string;
}>;

// Identical searches are cached briefly. Ingestion routes call
// revalidateTag("jobs") so Refresh never serves stale rows.
const cachedSearch = unstable_cache(
  async (serialized: string) => searchJobs(JSON.parse(serialized) as Filters),
  ["jobs-search"],
  { revalidate: 15, tags: ["jobs"] },
);

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const filters: Filters = {
    query: sp.q,
    location: sp.location,
    workMode: sp.workMode as Filters["workMode"],
    companyTypes: sp.companyTypes
      ? (sp.companyTypes.split(",") as Filters["companyTypes"])
      : undefined,
    skills: sp.skills ? sp.skills.split(",") : undefined,
    jobType: sp.jobType as Filters["jobType"],
    experience: sp.experience as Filters["experience"],
    daysOld: sp.daysOld ? Number(sp.daysOld) : undefined,
    page: sp.page ? Number(sp.page) : 1,
    pageSize: 20,
  };

  // List + counts are independent reads. Search logging is a blind write and
  // must not hold the response: schedule it after the response is sent.
  const [result, skillCounts] = await Promise.all([
    cachedSearch(JSON.stringify(filters)),
    getSignalSkillCounts(),
  ]);
  if (filters.query) {
    const query = filters.query;
    after(async () => {
      await logSearchEvent(query).catch(() => {});
    });
  }
  const selectedId = sp.selected;

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#111]">
      {/* Minimal top bar */}
      <header className="max-w-4xl mx-auto px-6 pt-8 flex items-center justify-between text-[13px]">
        <Link href="/" className="font-serif-calm text-xl">
          Job Search
        </Link>
        <SiteNav current="discover">
          <RefreshButton />
        </SiteNav>
      </header>

      {/* Centered hero */}
      <section className="max-w-4xl mx-auto px-6 pt-14 text-center">
        <div className="text-[11px] uppercase tracking-[0.15em] text-black/45">
          {result.total} open · Curated CS · Bangalore & Remote
        </div>
        <h1
          className="font-serif-calm mt-4"
          style={{ fontSize: "clamp(40px,6vw,68px)", lineHeight: 1.02 }}
        >
          What do you want next?
        </h1>
        <div className="mt-8">
          <Suspense>
            <JobFilters total={result.total} skills={skillCounts} />
          </Suspense>
          <Suspense>
            <JobImport />
          </Suspense>
        </div>
        {(filters.query || filters.skills?.length) && (
          <p className="mt-6 text-[13px] text-black/50">
            {filters.query
              ? `Results for “${filters.query}”`
              : "Filtered roles"}
            {filters.skills?.length ? ` · ${filters.skills.join(", ")}` : ""}
          </p>
        )}
      </section>

      {/* Calm list */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        {result.data.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-serif-calm text-3xl">Nothing matches — yet.</p>
            <p className="text-[14px] text-black/55 mt-2">
              Try a softer search or clear a filter.
            </p>
          </div>
        ) : (
          <JobBrowser
            jobs={result.data}
            page={result.page}
            totalPages={result.totalPages}
            initialSelected={selectedId ?? null}
          />
        )}
      </section>
    </div>
  );
}
