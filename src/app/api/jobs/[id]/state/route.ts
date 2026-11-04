import { prisma } from "@/lib/prisma";
import { getTailoredResume } from "@/lib/tailor/service";

// ─── Job panel state ─────────────────────────────────────────────────────────
// One request for everything the detail panel needs. Replaces separate
// analyze, tailor, and decision fetches and their round trips.

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;

  const [job, tailored] = await Promise.all([
    prisma.job.findUnique({
      where: { id },
      include: { analysis: true, decision: true },
    }),
    getTailoredResume(id),
  ]);

  if (!job) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(
    {
      analysis: job.analysis,
      tailored,
      versionCount: tailored?.versionCount ?? 0,
      decision: job.decision,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
