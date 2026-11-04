import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { getJobById, searchJobs } from "@/lib/repositories/jobs.repository";
import { analyzeJob, getAnalysis } from "@/lib/analysis/service";
import {
  getTailoredResume,
  tailorResume,
  approveTailoredResume,
} from "@/lib/tailor/service";
import { getPdfState, renderPdf } from "@/lib/pdf/service";
import { runIngestionPipeline } from "@/lib/ingestion/pipeline";
import { runNightly } from "@/lib/matching/nightly";
import { getDefaultProvider } from "@/lib/analysis/service";

// ─── Agent CLI ───────────────────────────────────────────────────────────────
// One stable, machine-readable entry point for every product action:
//
//   bun run agent -- status
//   bun run agent -- jobs list [--limit 10] [--query Go]
//   bun run agent -- jobs show <jobId>
//   bun run agent -- analyze <jobId> [--refresh]
//   bun run agent -- tailor <jobId> [--refresh]
//   bun run agent -- approve <jobId>
//   bun run agent -- pdf <jobId> [--refresh]
//   bun run agent -- decision <jobId> --status SAVED [--reason "..."]
//   bun run agent -- ingest
//   bun run agent -- nightly [--top 25]
//   bun run agent -- profile
//   bun run agent -- resumes
//   bun run agent -- smoke
//
// Every command prints one JSON object. Exit codes: 0 ok, 2 usage,
// 3 not found, 4 prerequisite/validation, 5 provider, 1 other.

const argv = process.argv.slice(2);
const command = argv[0] ?? "help";
const args = argv.slice(1);

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function refresh(): boolean {
  return args.includes("--refresh") || args.includes("--force");
}

function idArg(): string {
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) throw new UsageError("a job id is required");
  return id;
}

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

function print(commandName: string, data: unknown) {
  console.log(
    JSON.stringify({ ok: true, command: commandName, data }, null, 2),
  );
}

function fail(commandName: string, err: unknown) {
  const e = err as Error & { detail?: string };
  const name = e?.name ?? "Error";
  const message = e?.message ?? String(err);
  const code =
    name === "UsageError"
      ? 2
      : /not found/i.test(message) || /NotFound/.test(name)
        ? 3
        : /Needs|Validation|NotApproved|NothingTo/.test(name)
          ? 4
          : name === "LlmError"
            ? 5
            : 1;
  console.error(
    JSON.stringify(
      {
        ok: false,
        command: commandName,
        error: { name, message, detail: e?.detail ?? null },
      },
      null,
      2,
    ),
  );
  process.exitCode = code;
}

async function status() {
  const [visible, counts, profile, resumes] = await Promise.all([
    searchJobs({ page: 1, pageSize: 5 }),
    Promise.all([
      prisma.job.count(),
      prisma.jobAnalysis.count(),
      prisma.tailoredResume.count(),
      prisma.tailoredResume.count({ where: { status: "APPROVED" } }),
      prisma.applicationDecision.count(),
      prisma.nightlyRun.count(),
    ]),
    prisma.profile.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.resume.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);
  const [jobs, analyses, tailored, approved, decisions, nightlyRuns] = counts;
  return {
    jobs: { total: jobs, visible: visible.total, sample: visible.data },
    artifacts: {
      analyses,
      tailored,
      approved,
      decisions,
      nightlyRuns,
    },
    profile: profile
      ? {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          skills: profile.skills.length,
          baseResumeId: profile.baseResumeId,
        }
      : null,
    resumes,
    provider: getDefaultProvider().name,
  };
}

async function main() {
  switch (command) {
    case "status":
      return print(command, await status());

    case "jobs": {
      if (args[0] === "show") {
        const job = await getJobById(idArg());
        if (!job) throw new Error(`job not found: ${args[1]}`);
        return print(command, job);
      }
      const result = await searchJobs({
        query: flag("query"),
        location: flag("location"),
        page: Number(flag("page") ?? 1),
        pageSize: Math.min(Number(flag("limit") ?? 20), 100),
      });
      return print(command, result);
    }

    case "analyze": {
      const jobId = idArg();
      if (!refresh()) {
        const existing = await getAnalysis(jobId);
        if (existing)
          return print(command, { cached: true, analysis: existing });
      }
      const { analysis } = await analyzeJob(jobId);
      return print(command, { cached: false, analysis });
    }

    case "tailor": {
      const jobId = idArg();
      if (!refresh()) {
        const existing = await getTailoredResume(jobId);
        if (existing)
          return print(command, { cached: true, tailored: existing });
      }
      const { tailored } = await tailorResume(jobId);
      return print(command, { cached: false, tailored });
    }

    case "approve": {
      const jobId = idArg();
      const draft = await approveTailoredResume(jobId);
      return print(command, draft);
    }

    case "pdf": {
      const jobId = idArg();
      if (!refresh()) {
        const state = await getPdfState(jobId);
        if (state.renderStatus === "SUCCESS") {
          return print(command, { cached: true, ...state });
        }
      }
      const rendered = await renderPdf(jobId);
      return print(command, { cached: false, ...rendered });
    }

    case "decision": {
      const jobId = idArg();
      const statusValue = flag("status");
      const allowed = ["QUEUED", "OPENED", "APPLIED", "SAVED", "SKIPPED"];
      if (!statusValue || !allowed.includes(statusValue)) {
        throw new UsageError(`--status must be one of ${allowed.join(", ")}`);
      }
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true },
      });
      if (!job) throw new Error(`job not found: ${jobId}`);
      const decision = await prisma.applicationDecision.upsert({
        where: { jobId },
        update: {
          status: statusValue as "SAVED",
          reason: flag("reason") ?? null,
          decidedAt: new Date(),
        },
        create: {
          jobId,
          status: statusValue as "SAVED",
          reason: flag("reason") ?? null,
        },
      });
      return print(command, decision);
    }

    case "ingest":
      await runIngestionPipeline();
      return print(
        command,
        await prisma.sourceSync.findMany({
          orderBy: { startedAt: "desc" },
          take: 10,
        }),
      );

    case "nightly":
      return print(command, await runNightly(Number(flag("top") ?? 25)));

    case "profile":
      return print(
        command,
        await prisma.profile.findFirst({ orderBy: { updatedAt: "desc" } }),
      );

    case "resumes":
      return print(
        command,
        await prisma.resume.findMany({
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, updatedAt: true },
        }),
      );

    case "smoke": {
      const provider = getDefaultProvider();
      const raw = await provider.generateJson(
        "You are a JSON API. Return only JSON.",
        'Return exactly {"ok":true} and nothing else.',
      );
      return print(command, { provider: provider.name, raw });
    }

    case "help":
      return print(command, {
        commands: [
          "status",
          "jobs list|show",
          "analyze <id>",
          "tailor <id>",
          "approve <id>",
          "pdf <id>",
          "decision <id> --status <status>",
          "ingest",
          "nightly",
          "profile",
          "resumes",
          "smoke",
        ],
        flags: ["--refresh", "--limit", "--query", "--location", "--top"],
      });

    default:
      throw new UsageError(`unknown command: ${command}`);
  }
}

main()
  .catch((err) => fail(command, err))
  .finally(async () => {
    await prisma.$disconnect();
  });
