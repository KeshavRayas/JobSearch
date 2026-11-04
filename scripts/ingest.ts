import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { runIngestionPipeline } from "@/lib/ingestion/pipeline";

// ─── Ingestion entry point ───────────────────────────────────────────────────
// `bun run ingest` (and `bun run agent -- ingest`) run the pipeline and print
// the per-source result. The pipeline itself stays a pure exported function so
// the cron route can import it without side effects.

async function main() {
  const started = Date.now();
  await runIngestionPipeline();
  const syncs = await prisma.sourceSync.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      source: true,
      startedAt: true,
      jobsFetched: true,
      jobsCreated: true,
      jobsUpdated: true,
      success: true,
      error: true,
    },
  });
  console.log(
    JSON.stringify({ ok: true, ms: Date.now() - started, syncs }, null, 2),
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
