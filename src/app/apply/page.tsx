import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { getDecisionBoard } from "@/lib/repositories/jobs.repository";
import { formatDaysAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  QUEUED: "Queued",
  OPENED: "Opened",
  SAVED: "Saved",
  APPLIED: "Applied",
  SKIPPED: "Skipped",
} as const;

const SECTIONS = [
  ["QUEUED", "Ready to work", "Jobs you queued from Discover."],
  ["OPENED", "Opened", "Company pages you already opened."],
  ["SAVED", "Saved for later", "Kept without starting the application."],
  ["APPLIED", "Applied", "Submitted manually and confirmed."],
] as const;

// ─── Apply queue ─────────────────────────────────────────────────────────────
// Queueing from Discover stays on Discover. This page is the deliberate next
// step: review the queue, then open one workspace at a time.

export default async function ApplyQueuePage() {
  const columns = await getDecisionBoard();
  const byStatus = Object.fromEntries(
    columns.map((column) => [column.status, column.jobs]),
  ) as Record<string, (typeof columns)[number]["jobs"]>;

  const queued = byStatus.QUEUED ?? [];
  const total = SECTIONS.reduce(
    (count, [status]) => count + (byStatus[status]?.length ?? 0),
    0,
  );

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#111]">
      <header className="max-w-4xl mx-auto px-6 pt-8 flex items-center justify-between text-[13px]">
        <Link href="/" className="font-serif-calm text-xl">
          Job Search
        </Link>
        <SiteNav current="apply" />
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-14 text-center">
        <div className="text-[11px] uppercase tracking-[0.15em] text-black/45">
          {queued.length} ready · {total} in the queue
        </div>
        <h1
          className="font-serif-calm mt-4"
          style={{ fontSize: "clamp(40px, 6vw, 68px)", lineHeight: 1.02 }}
        >
          Your apply queue.
        </h1>
        <p className="text-[14px] text-black/55 mt-4 max-w-md mx-auto">
          Queue several jobs first. Then take them one at a time — review the
          resume, approve it, and open the company page yourself.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-black/15 px-5 py-2 text-[13px] font-medium hover:border-black/40 transition-colors"
          >
            Discover more jobs
          </Link>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-14">
        {total === 0 ? (
          <div className="py-20 text-center">
            <p className="font-serif-calm text-3xl">Nothing queued — yet.</p>
            <p className="text-[14px] text-black/55 mt-2">
              Press Apply on a few jobs and they will wait here.
            </p>
            <Link
              href="/"
              className="inline-block mt-6 rounded-full bg-[#111] text-white px-6 py-3 text-[13px] font-medium"
            >
              Go to Discover
            </Link>
          </div>
        ) : (
          <div className="space-y-12">
            {SECTIONS.map(([status, title, description]) => {
              const jobs = byStatus[status] ?? [];
              if (jobs.length === 0) return null;
              return (
                <section key={status}>
                  <div className="flex items-baseline justify-between gap-4 mb-4">
                    <div>
                      <h2 className="font-serif-calm text-[30px]">{title}</h2>
                      <p className="text-[12px] text-black/50 mt-1">
                        {description}
                      </p>
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.12em] text-black/40">
                      {jobs.length}
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {jobs.map((job) => (
                      <Link
                        key={job.id}
                        href={`/apply/${job.id}`}
                        className="calm-card block p-5 group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-black/45">
                              {job.companyName}
                            </div>
                            <div className="font-serif-calm text-[24px] leading-tight mt-1">
                              {job.title}
                            </div>
                            <div className="text-[12px] text-black/50 mt-1">
                              {[
                                job.location,
                                `queued ${formatDaysAgo(job.decidedAt)}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/55">
                              {STATUS_LABEL[status]}
                            </span>
                            <span className="text-[13px] text-black/35 group-hover:text-black transition-colors">
                              →
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
