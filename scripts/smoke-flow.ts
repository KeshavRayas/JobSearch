import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { searchJobs } from "@/lib/repositories/jobs.repository";
import { analyzeJob, getAnalysis } from "@/lib/analysis/service";
import {
  getTailoredResume,
  tailorResume,
  approveTailoredResume,
} from "@/lib/tailor/service";
import { getPdfState, renderPdf } from "@/lib/pdf/service";

// ─── Full-flow smoke test ────────────────────────────────────────────────────
// bun run smoke:flow [jobId] [--refresh]
// Runs analyze -> tailor -> approve -> PDF on a real job and prints one JSON
// summary. Spends model calls; stops at the first failed gate. Without a
// jobId, picks the newest visible job.

let currentStep = "start";
let selectedJobId: string | undefined;

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  let jobId = args.find((a) => !a.startsWith("--"));
  currentStep = "select-job";

  if (!jobId) {
    const visible = await searchJobs({ page: 1, pageSize: 1 });
    jobId = visible.data[0]?.id;
    if (!jobId) throw new Error("no visible job; run ingestion first");
  }
  selectedJobId = jobId;

  const started = Date.now();
  const steps: { step: string; ok: boolean; detail: unknown }[] = [];

  currentStep = "analyze";
  const analysis =
    !refresh && (await getAnalysis(jobId))
      ? await getAnalysis(jobId)
      : (await analyzeJob(jobId)).analysis;
  steps.push({ step: "analyze", ok: true, detail: analysis });

  currentStep = "tailor";
  const tailored =
    !refresh && (await getTailoredResume(jobId))
      ? await getTailoredResume(jobId)
      : (await tailorResume(jobId)).tailored;
  steps.push({ step: "tailor", ok: true, detail: tailored });

  currentStep = "approve";
  const draft = await getTailoredResume(jobId);
  const approved =
    draft?.status === "APPROVED" ? draft : await approveTailoredResume(jobId);
  steps.push({ step: "approve", ok: true, detail: approved });

  currentStep = "pdf";
  const pdf =
    !refresh &&
    (await getPdfState(jobId).catch(() => null))?.renderStatus === "SUCCESS"
      ? await getPdfState(jobId)
      : await renderPdf(jobId);
  steps.push({ step: "pdf", ok: true, detail: pdf });

  console.log(
    JSON.stringify(
      { ok: true, jobId, ms: Date.now() - started, steps },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          jobId: selectedJobId ?? null,
          step: currentStep,
          error: err instanceof Error ? err.message : String(err),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
