import { prisma } from "@/lib/prisma";
import { searchJobs } from "@/lib/repositories/jobs.repository";
import { getDefaultProfileRow } from "@/lib/matching/profile";
import { getDefaultProvider } from "@/lib/analysis/service";

// ─── Health ──────────────────────────────────────────────────────────────────
// Machine-readable "is this install usable?" endpoint. No secrets, no model
// calls. Returns 503 when the database is unreachable.

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const [visible, totalJobs, profile, resumes, lastSync, lastNightly] =
      await Promise.all([
        searchJobs({ page: 1, pageSize: 1 }),
        prisma.job.count(),
        getDefaultProfileRow(),
        prisma.resume.count(),
        prisma.sourceSync.findFirst({ orderBy: { startedAt: "desc" } }),
        prisma.nightlyRun.findFirst({ orderBy: { startedAt: "desc" } }),
      ]);

    const provider = getDefaultProvider();
    const cloud = process.env.LLM_PROVIDER === "cloud";

    return Response.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      database: { connected: true },
      jobs: { total: totalJobs, visible: visible.total },
      profile: {
        name: profile.name,
        skills: profile.skills.length,
        baseResumeId: profile.baseResumeId,
        configured: Boolean(profile.name) && profile.skills.length > 0,
      },
      resumes,
      provider: {
        name: provider.name,
        cloud,
        model: cloud
          ? (process.env.LLM_MODEL ?? null)
          : (process.env.OPENCODE_MODEL ?? "CLI default"),
        configured: cloud
          ? Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL)
          : true,
      },
      lastIngest: lastSync
        ? {
            source: lastSync.source,
            at: lastSync.startedAt,
            success: lastSync.success,
            fetched: lastSync.jobsFetched,
            created: lastSync.jobsCreated,
            error: lastSync.error,
          }
        : null,
      lastNightly: lastNightly
        ? {
            at: lastNightly.startedAt,
            finishedAt: lastNightly.finishedAt,
            success: lastNightly.success,
            matched: lastNightly.matched,
            error: lastNightly.error,
          }
        : null,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
