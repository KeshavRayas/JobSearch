import { notFound } from "next/navigation";
import Link from "next/link";
import { getJobById } from "@/lib/repositories/jobs.repository";
import { formatDaysAgo, formatSalary, enumLabel } from "@/lib/utils";

type Params = Promise<{ id: string }>;

// ─── Full-page job view (Calm Focus) ─────────────────────────────────────────
// Mirrors the homepage calm card at page scale: company eyebrow, serif title,
// one meta line, skill pills, quiet body. The overlay panel remains the
// primary apply surface; this page is the shareable/standalone equivalent.

export default async function JobDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const job = await getJobById(id);

  if (!job) notFound();

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#111]">
      <header className="max-w-4xl mx-auto px-6 pt-8 flex items-center justify-between text-[13px]">
        <Link href="/" className="font-serif-calm text-xl">
          Job Search
        </Link>
        <Link href="/" className="calm-pill">
          ← Back
        </Link>
      </header>

      <section className="max-w-4xl mx-auto px-6 py-14">
        <div className="calm-card p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.12em] text-black/45">
            {job.company.name}
          </div>
          <h1 className="font-serif-calm mt-2 leading-tight text-3xl sm:text-4xl">
            {job.title}
          </h1>
          <div className="text-[13px] text-black/55 mt-2">
            {[job.location, job.postedAt ? formatDaysAgo(job.postedAt) : null]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
            {formatSalary(
              job.salaryMin ?? undefined,
              job.salaryMax ?? undefined,
              job.salaryCurr ?? undefined,
            )}
          </div>

          <div className="mt-6">
            <h2 className="font-serif-calm text-[22px] mb-3">Role facts</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {(
                [
                  ["Type", job.jobType ? enumLabel(job.jobType) : null],
                  [
                    "Level",
                    job.experience ? enumLabel(job.experience) : null,
                  ],
                  [
                    "Work mode",
                    job.workMode === "REMOTE"
                      ? "Remote"
                      : job.workMode === "HYBRID"
                        ? "Hybrid"
                        : "On-site",
                  ],
                  ["Location", job.location],
                  [
                    "Posted",
                    job.postedAt ? formatDaysAgo(job.postedAt) : null,
                  ],
                  ["Source", enumLabel(job.source)],
                ] as [string, string | null][]
              ).map(([label, value]) =>
                value ? (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-black/45">
                      {label}
                    </dt>
                    <dd className="text-[13px] truncate" title={value}>
                      {value}
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          </div>

          {job.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {job.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-2.5 py-1 rounded-full bg-black/[0.04] text-[11px] font-medium text-black/60"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}

          <p className="text-[14px] leading-relaxed text-black/70 mt-6 whitespace-pre-line">
            {job.description}
          </p>

          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#111] text-white rounded-full px-6 py-3 text-[13px] font-medium transition-all duration-500 hover:opacity-90"
            >
              Apply on {job.company.name} ↗
            </a>
            <Link
              href={`/?selected=${job.id}`}
              className="text-[13px] underline underline-offset-4 decoration-black/20 hover:decoration-black transition-all duration-500"
            >
              Open in apply cockpit →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
