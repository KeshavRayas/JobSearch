import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { searchJobs } from "@/lib/repositories/jobs.repository";

// ─── Local product audit ─────────────────────────────────────────────────────
// One command that answers "is this install actually usable?":
//   bun run audit
// Prints JSON so an agent can consume it; exits non-zero when visibility or
// the base resume is broken.

async function main() {
  const visible = await searchJobs({ page: 1, pageSize: 3 });
  const totalJobs = await prisma.job.count();
  const missingPostedAt = await prisma.job.count({
    where: { postedAt: null },
  });
  const bySource = await prisma.job.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  const byStatus = await prisma.job.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const profile = await prisma.profile.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      baseResumeId: true,
      skills: true,
      minSalary: true,
      locations: true,
      workModes: true,
    },
  });
  const resumes = await prisma.resume.findMany({
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  const baseResume = profile?.baseResumeId
    ? (resumes.find((r) => r.id === profile.baseResumeId) ?? null)
    : (resumes[0] ?? null);

  const [analyses, tailored, covers, preps, decisions, nightlyRuns] =
    await Promise.all([
      prisma.jobAnalysis.count(),
      prisma.tailoredResume.count(),
      prisma.coverLetter.count(),
      prisma.interviewPrep.count(),
      prisma.applicationDecision.count(),
      prisma.nightlyRun.count(),
    ]);

  const latestTailored = await prisma.tailoredResume.findFirst({
    orderBy: { createdAt: "desc" },
    select: {
      jobId: true,
      version: true,
      validationStatus: true,
      renderStatus: true,
      createdAt: true,
    },
  });

  const report = {
    ok: visible.total > 0 && Boolean(baseResume),
    jobs: {
      total: totalJobs,
      visible: visible.total,
      missingPostedAt,
      bySource: Object.fromEntries(
        bySource.map((s) => [s.source, s._count._all]),
      ),
      byStatus: Object.fromEntries(
        byStatus.map((s) => [s.status, s._count._all]),
      ),
      sample: visible.data.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company.name,
        daysOld: j.daysOld,
      })),
    },
    profile: profile
      ? {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          skills: profile.skills.length,
          minSalary: profile.minSalary,
          locations: profile.locations,
          workModes: profile.workModes,
        }
      : null,
    baseResume,
    artifacts: {
      analyses,
      tailored,
      covers,
      preps,
      decisions,
      nightlyRuns,
      latestTailored,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (!baseResume) {
    console.error(
      "\n[audit] FAIL: no base resume. Upload or create one at /resumes.",
    );
    process.exitCode = 1;
  }
  if (visible.total === 0 && totalJobs > 0) {
    console.error(
      "\n[audit] FAIL: jobs exist but none are visible. Check classificationScore and effective dates.",
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
