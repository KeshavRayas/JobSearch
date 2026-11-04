import { prisma } from "@/lib/prisma";
import type { JobFilters, PaginatedResult, JobSearchResult } from "@/lib/types";
import { daysAgo } from "@/lib/utils";
import { SIGNAL_SKILLS } from "@/lib/constants";

export type SkillCount = { skill: string; count: number };

// Live counts for the curated signal-first set, using the same base
// visibility filter as searchJobs (ACTIVE, classified, ≤30d).
// Global counts (not narrowed by current filters) keep pills stable
// across navigations and preserve the instant static shell.
//
// Cached in-process for 10 minutes: counts only move when ingestion runs
// (every 6h), so per-request recomputation is pure waste. Small enough to
// hold per server instance; staleness is bounded and harmless (UI hints).
const SKILL_COUNT_TTL_MS = 10 * 60_000;
let skillCountCache: { at: number; data: SkillCount[] } | null = null;

export async function getSignalSkillCounts(): Promise<SkillCount[]> {
  if (skillCountCache && Date.now() - skillCountCache.at < SKILL_COUNT_TTL_MS) {
    return skillCountCache.data;
  }
  const rows = await prisma.$queryRawUnsafe<{ skill: string; count: number }[]>(
    `SELECT s.skill AS skill, COUNT(*)::int AS count
     FROM "Job" j, LATERAL unnest(j."skills") AS s(skill)
     WHERE j."status" = 'ACTIVE'
       AND j."classificationScore" IS NOT NULL
       AND j."classificationScore" >= 0.70
       AND COALESCE(j."postedAt", j."scrapedAt") >= NOW() - INTERVAL '30 days'
       AND s.skill = ANY($1)
     GROUP BY s.skill`,
    [...SIGNAL_SKILLS],
  );
  const bySkill = new Map(rows.map((r) => [r.skill, r.count]));
  const data = [...SIGNAL_SKILLS].map((skill) => ({
    skill,
    count: bySkill.get(skill) ?? 0,
  }));
  skillCountCache = { at: Date.now(), data };
  return data;
}

export async function searchJobs(
  filters: JobFilters,
): Promise<PaginatedResult<JobSearchResult>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Always filter active jobs with valid classification
  conditions.push(`j."status" = 'ACTIVE'`);
  conditions.push(`j."classificationScore" IS NOT NULL`);
  conditions.push(`j."classificationScore" >= 0.70`);
  // Recency uses the effective date: many sources omit postedAt, and hiding
  // every one of those rows made a populated database look empty.
  conditions.push(
    `COALESCE(j."postedAt", j."scrapedAt") >= NOW() - INTERVAL '30 days'`,
  );

  if (filters.query) {
    conditions.push(
      `j."searchVector" @@ plainto_tsquery('english', $${paramIdx})`,
    );
    params.push(filters.query);
    paramIdx++;
  }

  if (filters.location) {
    conditions.push(`j."location" ILIKE $${paramIdx}`);
    params.push(`%${filters.location}%`);
    paramIdx++;
  }

  if (filters.workMode) {
    conditions.push(`j."workMode" = $${paramIdx}::"WorkMode"`);
    params.push(filters.workMode);
    paramIdx++;
  }

  if (filters.companyTypes?.length) {
    conditions.push(`c."companyType" = ANY($${paramIdx}::"CompanyType"[])`);
    params.push(filters.companyTypes);
    paramIdx++;
  }

  if (filters.skills?.length) {
    conditions.push(`j."skills" && $${paramIdx}`);
    params.push(filters.skills);
    paramIdx++;
  }

  if (filters.jobType) {
    conditions.push(`j."jobType" = $${paramIdx}::"JobType"`);
    params.push(filters.jobType);
    paramIdx++;
  }

  if (filters.experience) {
    conditions.push(`j."experience" = $${paramIdx}::"ExperienceLevel"`);
    params.push(filters.experience);
    paramIdx++;
  }

  if (filters.daysOld) {
    conditions.push(
      `DATE_PART('day', NOW() - COALESCE(j."postedAt", j."scrapedAt")) <= $${paramIdx}`,
    );
    params.push(filters.daysOld);
    paramIdx++;
  }

  if (filters.sources?.length) {
    conditions.push(`j."source" = ANY($${paramIdx}::"JobSource"[])`);
    params.push(filters.sources);
    paramIdx++;
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const countResult = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `SELECT COUNT(*)::bigint as total
     FROM "Job" j
     JOIN "Company" c ON c.id = j."companyId"
     ${where}`,
    ...params,
  );
  const total = Number(countResult[0]?.total ?? 0);

  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      title: string;
      description: string;
      applyUrl: string;
      workMode: string;
      location: string | null;
      salaryMin: number | null;
      salaryMax: number | null;
      salaryCurr: string | null;
      jobType: string | null;
      experience: string | null;
      source: string;
      postedAt: Date | null;
      effectiveDate: Date;
      skills: string[];
      companyId: string;
      companyName: string;
      companySlug: string;
      companyLogo: string | null;
      companyType: string;
    }[]
  >(
    `SELECT j.id, j.title, j.description, j."applyUrl", j."workMode",
            j.location, j."salaryMin", j."salaryMax", j."salaryCurr",
            j."jobType", j."experience", j."source",
            j."postedAt", COALESCE(j."postedAt", j."scrapedAt") as "effectiveDate",
            j.skills,
            c.id as "companyId", c.name as "companyName", c.slug as "companySlug",
            c.logo as "companyLogo", c."companyType"
     FROM "Job" j
     JOIN "Company" c ON c.id = j."companyId"
     ${where}
     ORDER BY j."sourceScore" DESC,
              COALESCE(j."postedAt", j."scrapedAt") DESC,
              j."scrapedAt" DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    ...params,
    pageSize,
    offset,
  );

  const data = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    applyUrl: r.applyUrl,
    workMode: r.workMode as "REMOTE" | "HYBRID" | "ONSITE",
    location: r.location ?? undefined,
    salaryMin: r.salaryMin ?? undefined,
    salaryMax: r.salaryMax ?? undefined,
    salaryCurr: r.salaryCurr ?? undefined,
    jobType: (r.jobType ?? undefined) as JobSearchResult["jobType"],
    experience: (r.experience ?? undefined) as JobSearchResult["experience"],
    source: r.source as JobSearchResult["source"],
    postedAt: r.effectiveDate,
    daysOld: daysAgo(r.effectiveDate),
    skills: r.skills ?? [],
    company: {
      id: r.companyId,
      name: r.companyName,
      slug: r.companySlug,
      logo: r.companyLogo,
      companyType: r.companyType as "STARTUP" | "MNC",
    },
  }));

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getJobById(id: string) {
  return prisma.job.findUnique({
    where: { id },
    include: { company: true },
  });
}

export type DecisionBoardColumn = {
  status: "SAVED" | "QUEUED" | "OPENED" | "APPLIED" | "SKIPPED";
  jobs: {
    id: string;
    title: string;
    location: string | null;
    postedAt: Date | null;
    decidedAt: Date;
    companyName: string;
  }[];
};

// Application tracker board (Phase 3B): every decided job grouped by
// status. Reads only — moves happen in JobDetailPanel (the writers).
export async function getDecisionBoard(): Promise<DecisionBoardColumn[]> {
  const rows = await prisma.applicationDecision.findMany({
    orderBy: { decidedAt: "desc" },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          location: true,
          postedAt: true,
          company: { select: { name: true } },
        },
      },
    },
  });
  const order = ["SAVED", "QUEUED", "OPENED", "APPLIED", "SKIPPED"] as const;
  return order.map((status) => ({
    status,
    jobs: rows
      .filter((r) => r.status === status)
      .map((r) => ({
        id: r.job.id,
        title: r.job.title,
        location: r.job.location,
        postedAt: r.job.postedAt,
        decidedAt: r.decidedAt,
        companyName: r.job.company.name,
      })),
  }));
}
