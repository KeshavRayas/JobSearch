import Link from "next/link";
import { getDecisionBoard } from "@/lib/repositories/jobs.repository";
import { formatDaysAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const COLUMN_LABELS = {
  SAVED: "Saved",
  QUEUED: "Queued",
  OPENED: "Opened",
  APPLIED: "Applied",
  SKIPPED: "Skipped",
} as const;

// ─── Application tracker (Phase 3B) ──────────────────────────────────────────
// Read-only kanban over ApplicationDecision rows. Status moves happen in
// JobDetailPanel; this page only reflects them. Calm styling throughout.

export default async function TrackerPage() {
  const columns = await getDecisionBoard();
  const total = columns.reduce((n, c) => n + c.jobs.length, 0);

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#111]">
      <header className="max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between text-[13px]">
        <Link href="/" className="font-serif-calm text-xl">
          Job Search
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/" className="calm-pill">
            Discover
          </Link>
          <Link href="/resumes" className="calm-pill">
            Resumes
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-14 text-center">
        <div className="text-[11px] uppercase tracking-[0.15em] text-black/45">
          {total} tracked
        </div>
        <h1
          className="font-serif-calm mt-4"
          style={{ fontSize: "clamp(40px,6vw,68px)", lineHeight: 1.02 }}
        >
          Where things stand.
        </h1>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-14">
        {total === 0 ? (
          <div className="py-20 text-center">
            <p className="font-serif-calm text-3xl">Nothing tracked — yet.</p>
            <p className="text-[14px] text-black/55 mt-2">
              Open a job and save it, or mark it applied.
            </p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 items-start">
            {columns.map((col) => (
              <div key={col.status} className="flex-1 min-w-[220px]">
                <div className="text-[11px] uppercase tracking-[0.12em] text-black/45 mb-3 text-center">
                  {COLUMN_LABELS[col.status]} · {col.jobs.length}
                </div>
                <div className="grid gap-3">
                  {col.jobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/?selected=${job.id}`}
                      className="calm-card block p-4"
                    >
                      <div className="text-[11px] uppercase tracking-[0.12em] text-black/45">
                        {job.companyName}
                      </div>
                      <div className="font-serif-calm text-lg leading-snug mt-1">
                        {job.title}
                      </div>
                      <div className="text-[12px] text-black/55 mt-1">
                        {[
                          job.location,
                          job.postedAt ? formatDaysAgo(job.postedAt) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
