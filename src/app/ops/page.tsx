import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { searchJobs } from "@/lib/repositories/jobs.repository";
import { getDefaultProfileRow } from "@/lib/matching/profile";
import { SiteNav } from "@/components/SiteNav";
import { RefreshButton } from "@/components/RefreshButton";

export const dynamic = "force-dynamic";

// ─── Ops (Calm Focus) ────────────────────────────────────────────────────────
// Read-only local operations view: is the database reachable, are jobs
// visible, is the profile/resume configured, did ingestion and the nightly
// matcher run? Actions stay explicit commands (see AGENTS.md).

function fmt(date: Date | null | undefined): string {
  if (!date) return "never";
  return new Date(date).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OpsPage() {
  const [
    visible,
    totalJobs,
    companies,
    profile,
    resumes,
    analyses,
    tailored,
    covers,
    preps,
    decisions,
    syncs,
    runs,
  ] = await Promise.all([
    searchJobs({ page: 1, pageSize: 1 }),
    prisma.job.count(),
    prisma.company.count(),
    getDefaultProfileRow(),
    prisma.resume.count(),
    prisma.jobAnalysis.count(),
    prisma.tailoredResume.count(),
    prisma.coverLetter.count(),
    prisma.interviewPrep.count(),
    prisma.applicationDecision.count(),
    prisma.sourceSync.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    prisma.nightlyRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
  ]);

  const baseResume = profile.baseResumeId
    ? await prisma.resume.findUnique({
        where: { id: profile.baseResumeId },
        select: { id: true, title: true },
      })
    : null;
  const latestSync = syncs[0] ?? null;
  const providerCloud = process.env.LLM_PROVIDER === "cloud";

  const checks = [
    {
      label: "Database",
      ok: true,
      detail: "reachable",
    },
    {
      label: "Visible jobs",
      ok: visible.total > 0,
      detail:
        visible.total > 0
          ? `${visible.total} of ${totalJobs}`
          : `${totalJobs} total, none within 30 days — run ingestion`,
    },
    {
      label: "Profile",
      ok: Boolean(profile.name) && profile.skills.length > 0,
      detail: `${profile.name ?? "no name"} · ${profile.skills.length} skills`,
    },
    {
      label: "Base resume",
      ok: Boolean(baseResume),
      detail: baseResume?.title ?? "none pinned — open Settings",
    },
    {
      label: "LLM provider",
      ok: providerCloud
        ? Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL)
        : true,
      detail: providerCloud
        ? `cloud · ${process.env.LLM_MODEL ?? "model unset"}`
        : `opencode CLI · ${process.env.OPENCODE_MODEL ?? "CLI default"}`,
    },
    {
      label: "Last ingestion",
      ok: Boolean(latestSync?.success),
      detail: latestSync
        ? `${latestSync.source} · ${fmt(latestSync.startedAt)}${
            latestSync.error ? ` · ${latestSync.error}` : ""
          }`
        : "never run",
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#111]">
      <header className="max-w-4xl mx-auto px-6 pt-8 flex items-center justify-between text-[13px]">
        <Link href="/" className="font-serif-calm text-xl">
          Job Search
        </Link>
        <SiteNav current="ops" />
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-14 text-center">
        <div className="text-[11px] uppercase tracking-[0.15em] text-black/45">
          Local operations
        </div>
        <h1
          className="font-serif-calm mt-4"
          style={{ fontSize: "clamp(40px,6vw,68px)", lineHeight: 1.02 }}
        >
          Is it working?
        </h1>
        <p className="mt-4 text-[14px] text-black/55">
          One page for the pipeline, the model, and the data.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <RefreshButton />
          <span className="text-[12px] text-black/45">
            or `bun run agent -- ingest`
          </span>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-12 space-y-4">
        <div className="calm-card p-6 sm:p-8">
          <h2 className="font-serif-calm text-[24px]">Checks</h2>
          <div className="mt-4 divide-y divide-black/[0.06]">
            {checks.map((check) => (
              <div
                key={check.label}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div>
                  <div className="text-[13px] font-medium">{check.label}</div>
                  <div className="text-[12px] text-black/50 mt-0.5">
                    {check.detail}
                  </div>
                </div>
                <span
                  className={`text-[11px] uppercase tracking-[0.12em] ${
                    check.ok ? "text-black/55" : "text-red-700/80"
                  }`}
                >
                  {check.ok ? "ok" : "attention"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="calm-card p-6 sm:p-8">
          <h2 className="font-serif-calm text-[24px]">Artifacts</h2>
          <p className="mt-1 text-[13px] text-black/55">
            {companies} companies · {resumes} resumes
          </p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ["Analyses", analyses],
              ["Tailored", tailored],
              ["Cover letters", covers],
              ["Interview prep", preps],
              ["Decisions", decisions],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="font-serif-calm text-3xl">{value}</div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-black/45 mt-1">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="calm-card p-6 sm:p-8">
          <h2 className="font-serif-calm text-[24px]">Recent ingestion</h2>
          {syncs.length === 0 ? (
            <p className="mt-2 text-[13px] text-black/55">
              Nothing yet. Press Refresh.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-black/[0.06]">
              {syncs.map((sync) => (
                <div
                  key={sync.id}
                  className="py-2.5 flex items-center justify-between gap-4 text-[13px]"
                >
                  <span className="w-24 text-black/55">{sync.source}</span>
                  <span className="text-black/45 text-[12px]">
                    {fmt(sync.startedAt)}
                  </span>
                  <span className="text-black/55 text-[12px]">
                    {sync.jobsFetched} fetched · {sync.jobsCreated} new
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.12em]">
                    {sync.success ? "ok" : "failed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="calm-card p-6 sm:p-8">
          <h2 className="font-serif-calm text-[24px]">Nightly runs</h2>
          {runs.length === 0 ? (
            <p className="mt-2 text-[13px] text-black/55">
              Nothing yet. Run `bun run agent -- nightly`.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-black/[0.06]">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="py-2.5 flex items-center justify-between gap-4 text-[13px]"
                >
                  <span className="text-black/45 text-[12px]">
                    {fmt(run.startedAt)}
                  </span>
                  <span className="text-black/55 text-[12px]">
                    {run.scored} scored · {run.matched} matched
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.12em]">
                    {run.success ? "ok" : "failed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
