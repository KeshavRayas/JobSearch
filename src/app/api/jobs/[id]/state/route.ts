import { prisma } from "@/lib/prisma";

// ─── Job panel state ─────────────────────────────────────────────────────────
// One request for everything the detail panel needs. Replaces five separate
// fetches (analyze, tailor, decision, cover, interview) and their Neon
// round trips.

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      analysis: true,
      decision: true,
      coverLetter: true,
      interviewPrep: true,
      tailoredResumes: {
        where: { isCurrent: true },
        orderBy: { version: "desc" },
        take: 1,
      },
      _count: { select: { tailoredResumes: true } },
    },
  });

  if (!job) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(
    {
      analysis: job.analysis,
      tailored: job.tailoredResumes[0] ?? null,
      versionCount: job._count.tailoredResumes,
      decision: job.decision,
      cover: job.coverLetter,
      interview: job.interviewPrep,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
