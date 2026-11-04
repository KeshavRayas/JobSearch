import { prisma } from "@/lib/prisma";
import { getTailoredResume } from "@/lib/tailor/service";

// ─── Job panel state ─────────────────────────────────────────────────────────
// One request for everything the detail panel needs: job analysis, the current
// resume draft, the tracker decision, and the contact block for the document.

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;

  const [job, tailored, profile] = await Promise.all([
    prisma.job.findUnique({
      where: { id },
      include: { analysis: true, decision: true },
    }),
    getTailoredResume(id),
    prisma.profile.findFirst({ orderBy: { updatedAt: "desc" } }),
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
