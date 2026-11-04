import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import type { JobSource } from "@/lib/sources/interface";
import { AdzunaSource } from "@/lib/sources/adzuna";
import { JoobleSource } from "@/lib/sources/jooble";
import { RemotiveSource } from "@/lib/sources/remotive";
import { GreenhouseSource } from "@/lib/sources/greenhouse";
import { LeverSource } from "@/lib/sources/lever";
import { AshbySource } from "@/lib/sources/ashby";
import { WorkdaySource } from "@/lib/sources/workday";
import { extractSkills } from "@/lib/ingestion/skills";
import { withRetry } from "@/lib/jobs/retry";
import { isEntryLevel } from "@/lib/ingestion/experience";
import { classifyJob } from "@/lib/ingestion/classifier";
import { getWorkMode } from "@/lib/ingestion/location";
import { cleanupOldLogs } from "@/lib/ingestion/log";
import { stripHtml } from "@/lib/utils";
import { rawJobSchema } from "@/lib/validation";
import type { JobSource as JobSourceEnum } from "@/generated/prisma/enums";

const STALE_DAYS_THRESHOLD = 30;

const SOURCE_SCORES: Record<string, number> = {
  greenhouse: 3,
  lever: 3,
  ashby: 3,
  // Workday starts at 2: ATS-direct feed, but promote to 3 only after a
  // week of clean SourceSync logs proves parity with the big three.
  workday: 2,
  remotive: 1,
  adzuna: 0,
  jooble: 0,
};

function getSourceScore(name: string): number {
  return SOURCE_SCORES[name.toLowerCase()] ?? 0;
}

const SOURCES: JobSource[] = [
  new AdzunaSource(),
  new JoobleSource(),
  new RemotiveSource(),
  new GreenhouseSource(),
  new LeverSource(),
  new AshbySource(),
  new WorkdaySource(),
];

function normalizeSourceName(name: string): JobSourceEnum {
  const map: Record<string, JobSourceEnum> = {
    adzuna: "ADZUNA",
    jooble: "JOOBLE",
    remotive: "REMOTIVE",
    greenhouse: "GREENHOUSE",
    lever: "LEVER",
    ashby: "ASHBY",
    workday: "WORKDAY",
  };
  return map[name] ?? "ADZUNA";
}

const CHUNK_SIZE = 100;

const UPSERT_COLS = `"id", "externalId", "source", "title", "description", "applyUrl", "companyId", "location", "workMode", "salaryMin", "salaryMax", "salaryCurr", "jobType", "experience", "skills", "postedAt", "searchVector", "classificationScore", "sourceScore"`;

const UPSERT_CONFLICT = `ON CONFLICT ("externalId", "source") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "applyUrl" = EXCLUDED."applyUrl",
  "location" = EXCLUDED."location",
  "workMode" = EXCLUDED."workMode",
  "salaryMin" = EXCLUDED."salaryMin",
  "salaryMax" = EXCLUDED."salaryMax",
  "salaryCurr" = EXCLUDED."salaryCurr",
  "jobType" = EXCLUDED."jobType",
  "experience" = EXCLUDED."experience",
  "skills" = EXCLUDED."skills",
  "postedAt" = EXCLUDED."postedAt",
  "searchVector" = to_tsvector('english', EXCLUDED."title" || ' ' || EXCLUDED."description"),
  "classificationScore" = EXCLUDED."classificationScore",
  "sourceScore" = EXCLUDED."sourceScore"`;

function buildJobParams(e: {
  id: string;
  externalId: string;
  source: string;
  title: string;
  description: string;
  applyUrl: string;
  companyId: string;
  location: string | null;
  workMode: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurr: string | null;
  jobType: string | null;
  experience: string | null;
  skills: string[];
  postedAt: Date | null;
  classificationScore: number;
  sourceScore: number;
}): unknown[] {
  return [
    e.id,
    e.externalId,
    e.source,
    e.title,
    e.description,
    e.applyUrl,
    e.companyId,
    e.location,
    e.workMode,
    e.salaryMin,
    e.salaryMax,
    e.salaryCurr,
    e.jobType,
    e.experience,
    e.skills,
    e.postedAt,
    e.classificationScore,
    e.sourceScore,
  ];
}

function buildValuePlaceholders(start: number, count: number): string {
  const cols = 18;
  return Array.from({ length: count }, (_, i) => {
    const offset = start + i * cols;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}::"JobSource", $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}::"WorkMode", $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}::"JobType", $${offset + 14}::"ExperienceLevel", $${offset + 15}, $${offset + 16}, to_tsvector('english', $${offset + 4} || ' ' || $${offset + 5}), $${offset + 17}, $${offset + 18})`;
  }).join(", ");
}

export async function runIngestionPipeline(): Promise<void> {
  // Pre-load all companies into a map (saves N separate queries)
  const allCompanies = await prisma.company.findMany();
  const companyMap = new Map(
    allCompanies.map((c) => [c.name.toLowerCase(), c.id]),
  );

  // Fetch all sources in parallel
  const sourceResults = await Promise.allSettled(
    SOURCES.map(async (source) => {
      const sourceEnum = normalizeSourceName(source.name);
      const sync = await prisma.sourceSync.create({
        data: { source: sourceEnum, startedAt: new Date() },
      });

      try {
        // Transient tenant failures retry inside this run (3 attempts,
        // 5s/15s backoff, 2min cap) instead of waiting 6h for next cron.
        const rawJobs = await withRetry(() => source.fetchJobs(), {
          attempts: 3,
          baseDelayMs: 5_000,
          timeoutMs: 120_000,
          label: `fetch:${source.name}`,
        });
        return { sourceEnum, rawJobs, sync, source };
      } catch (err) {
        await prisma.sourceSync.update({
          where: { id: sync.id },
          data: { finishedAt: new Date(), success: false, error: String(err) },
        });
        throw err;
      }
    }),
  );

  // Process all sources in parallel
  await Promise.allSettled(
    sourceResults.map(async (result) => {
      if (result.status === "rejected") return;

      const { sourceEnum, rawJobs, sync, source } = result.value;
      if (rawJobs.length === 0) return;

      const validEntries: {
        id: string;
        externalId: string;
        source: string;
        title: string;
        description: string;
        applyUrl: string;
        companyId: string;
        location: string | null;
        workMode: string;
        salaryMin: number | null;
        salaryMax: number | null;
        salaryCurr: string | null;
        jobType: string | null;
        experience: string | null;
        skills: string[];
        postedAt: Date | null;
        classificationScore: number;
        sourceScore: number;
      }[] = [];

      const logEntries: {
        source: string;
        externalId: string;
        rawPayload: string;
      }[] = [];
      let rejectedNonCs = 0;
      let rejectedExp = 0;
      let rejectedLoc = 0;
      let rejectedStale = 0;

      for (const raw of rawJobs) {
        const parsed = rawJobSchema.safeParse(raw);
        if (!parsed.success) continue;

        const job = parsed.data;

        if (job.postedAt) {
          const ageDays =
            (Date.now() - job.postedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays > STALE_DAYS_THRESHOLD) {
            rejectedStale++;
            continue;
          }
        }

        const classification = classifyJob(job);
        if (!classification.accepted) {
          logEntries.push({
            source: sourceEnum,
            externalId: job.externalId,
            rawPayload: JSON.stringify({
              ...raw,
              _rejection: classification.reason,
            }),
          });
          rejectedNonCs++;
          continue;
        }

        const entryCheck = isEntryLevel(job);
        if (!entryCheck.accepted) {
          logEntries.push({
            source: sourceEnum,
            externalId: job.externalId,
            rawPayload: JSON.stringify({
              ...raw,
              _rejection: entryCheck.reason,
            }),
          });
          rejectedExp++;
          continue;
        }

        const workMode = getWorkMode(job);
        if (!workMode) {
          logEntries.push({
            source: sourceEnum,
            externalId: job.externalId,
            rawPayload: JSON.stringify({
              ...raw,
              _rejection: "Invalid location for non-remote job",
            }),
          });
          rejectedLoc++;
          continue;
        }

        const sourceScore = getSourceScore(source.name);
        logEntries.push({
          source: sourceEnum,
          externalId: job.externalId,
          rawPayload: JSON.stringify(raw),
        });

        // Lookup company from pre-loaded map, upsert if unknown
        const companyKey = job.companyName.toLowerCase();
        let companyId = companyMap.get(companyKey);
        if (!companyId) {
          const slug = job.companyName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/-+$/, "");
          const company = await prisma.company.upsert({
            where: { slug },
            update: {},
            create: { name: job.companyName, slug, companyType: "STARTUP" },
          });
          companyId = company.id;
          companyMap.set(companyKey, companyId);
        }

        const skills = extractSkills(job.title, job.description);
        const cleanDescription = stripHtml(job.description);

        validEntries.push({
          id: nanoid(),
          externalId: job.externalId,
          source: sourceEnum,
          title: job.title,
          description: cleanDescription,
          applyUrl: job.applyUrl,
          companyId,
          location: job.location ?? null,
          workMode,
          salaryMin: job.salaryMin ?? null,
          salaryMax: job.salaryMax ?? null,
          salaryCurr: job.salaryCurr ?? null,
          jobType: job.jobType ?? null,
          experience: entryCheck.experienceLevel ?? null,
          skills,
          postedAt: job.postedAt ?? null,
          classificationScore: classification.confidence,
          sourceScore,
        });
      }

      // Batch insert log entries (single multi-row INSERT)
      if (logEntries.length > 0) {
        const logValues = logEntries
          .map((_, i) => {
            const base = i * 4;
            return `($${base + 1}, $${base + 2}::"JobSource", $${base + 3}, $${base + 4}::jsonb)`;
          })
          .join(", ");
        const logParams = logEntries.flatMap((e) => [
          nanoid(),
          e.source,
          e.externalId,
          e.rawPayload,
        ]);
        await prisma.$executeRawUnsafe(
          `INSERT INTO "JobIngestionLog" ("id", "source", "externalId", "rawPayload") VALUES ${logValues}`,
          ...logParams,
        );
      }

      // Batch upsert valid jobs (single multi-row INSERT per chunk)
      for (let i = 0; i < validEntries.length; i += CHUNK_SIZE) {
        const chunk = validEntries.slice(i, i + CHUNK_SIZE);
        const values = buildValuePlaceholders(0, chunk.length);
        const params = chunk.flatMap(buildJobParams);
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Job" (${UPSERT_COLS}) VALUES ${values} ${UPSERT_CONFLICT}`,
          ...params,
        );
      }

      console.log(
        `[${sourceEnum}] Fetched: ${rawJobs.length} | Validated: ${validEntries.length} | Rejected: ${rejectedNonCs} non-CS, ${rejectedExp} exp, ${rejectedLoc} loc, ${rejectedStale} stale`,
      );

      await prisma.sourceSync.update({
        where: { id: sync.id },
        data: {
          finishedAt: new Date(),
          jobsFetched: rawJobs.length,
          jobsCreated: validEntries.length,
          success: true,
          error: `rejected: ${rejectedNonCs} non-CS, ${rejectedExp} exp, ${rejectedLoc} loc, ${rejectedStale} stale`,
        },
      });
    }),
  );

  // Cleanup old logs and stale jobs in parallel
  await Promise.all([
    cleanupOldLogs(),
    prisma.job.deleteMany({
      where: {
        postedAt: {
          lt: new Date(Date.now() - STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);
}
