import { prisma } from "@/lib/prisma";
import { getDecisionBoard } from "@/lib/repositories/jobs.repository";
import { getTailoredResume } from "@/lib/tailor/service";

// ─── Application workspace state ─────────────────────────────────────────────
// One request for the full-screen workspace: job, analysis, current resume
// draft, base resume for the change map, decision, profile, and apply queue.

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;

  const [job, tailored, profile, board] = await Promise.all([
    prisma.job.findUnique({
      where: { id },
      include: { company: true, analysis: true, decision: true },
    }),
    getTailoredResume(id),
    prisma.profile.findFirst({ orderBy: { updatedAt: "desc" } }),
    getDecisionBoard(),
  ]);

  if (!job) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const baseId = tailored?.baseResumeId ?? profile?.baseResumeId ?? null;
  const base = baseId
    ? await prisma.resume.findUnique({
        where: { id: baseId },
        select: { id: true, title: true, content: true },
      })
    : null;

  const queue = board
    .flatMap((column) =>
      column.jobs.map((item) => ({ ...item, status: column.status })),
    )
    .filter((item) =>
      ["QUEUED", "OPENED", "APPLIED", "SAVED"].includes(item.status),
    )
    .slice(0, 20);

  if (!queue.some((item) => item.id === id)) {
    queue.unshift({
      id: job.id,
      title: job.title,
      location: job.location,
      postedAt: job.postedAt,
      decidedAt: job.decision?.decidedAt ?? new Date(),
      companyName: job.company.name,
      status: job.decision?.status ?? "QUEUED",
    });
  }

  return Response.json(
    {
      job: {
        id: job.id,
        title: job.title,
        description: job.description,
        applyUrl: job.applyUrl,
        location: job.location,
        workMode: job.workMode,
        jobType: job.jobType,
        experience: job.experience,
        source: job.source,
        postedAt: job.postedAt,
        skills: job.skills,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurr: job.salaryCurr,
        company: {
          id: job.company.id,
          name: job.company.name,
          slug: job.company.slug,
          logo: job.company.logo,
          companyType: job.company.companyType,
        },
      },
      analysis: job.analysis,
      tailored,
      base,
      versionCount: tailored?.versionCount ?? 0,
      decision: job.decision,
      profile: profile
        ? {
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            linkedin: profile.linkedin,
            github: profile.github,
            location: profile.locations[0] ?? null,
          }
        : null,
      queue,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
