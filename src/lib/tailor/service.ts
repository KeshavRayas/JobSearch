import { prisma } from "@/lib/prisma";
import {
  TAILOR_SYSTEM_PROMPT,
  buildTailorPrompt,
  tailoredResumeSchema,
  type TailoredResumeData,
} from "@/lib/tailor/contract";
import { collectEvidencePair } from "@/lib/tailor/evidence";
import { validateTailoredResume } from "@/lib/tailor/validate";
import { canonicalizeTailored } from "@/lib/tailor/canonical";
import type { ResumeData } from "@/lib/resume.types";
import { hasResumeContent } from "@/lib/resume.utils";
import { getDefaultProvider, setDefaultProvider } from "@/lib/analysis/service";
import type { LlmProvider } from "@/lib/llm/types";
import { generateJsonSanitized } from "@/lib/llm/sanitize";
import { parseWithSingleRetry } from "@/lib/llm/retry";

export class NeedsAnalysisError extends Error {
  constructor() {
    super("analyze the job before tailoring — no JobAnalysis found");
    this.name = "NeedsAnalysisError";
  }
}

export class EmptyResumeError extends Error {
  constructor() {
    super("base resume has no sections — add resume content before tailoring");
    this.name = "EmptyResumeError";
  }
}

export class TailorValidationError extends Error {
  constructor(detail: string) {
    super(`tailored resume failed validation: ${detail}`);
    this.name = "TailorValidationError";
  }
}

export { setDefaultProvider };

/**
 * Explicit base resume via Profile.baseResumeId, falling back to the most
 * recently updated resume. The pin removes timestamp-tie nondeterminism
 * between multiple resumes (production) and keeps tests hermetic.
 */
export async function getBaseResume() {
  const profile = await prisma.profile.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (profile?.baseResumeId) {
    const pinned = await prisma.resume.findUnique({
      where: { id: profile.baseResumeId },
    });
    if (pinned) return pinned;
  }
  return prisma.resume.findFirst({ orderBy: { updatedAt: "desc" } });
}

/** Shared guard: load the base resume and ensure it has content. */
export async function requireBaseResumeContent() {
  const base = await getBaseResume();
  const content = base?.content as ResumeData | null;
  if (!base || !content || !hasResumeContent(content))
    throw new EmptyResumeError();
  return { base, content };
}

export async function getTailoredResume(jobId: string) {
  const [current, versionCount] = await Promise.all([
    prisma.tailoredResume.findFirst({
      where: { jobId, isCurrent: true },
      orderBy: { version: "desc" },
    }),
    prisma.tailoredResume.count({ where: { jobId } }),
  ]);
  if (!current) return null;
  return { ...current, versionCount };
}

/** All versions, newest first — for the history UI. */
export async function getTailoredVersions(jobId: string) {
  return prisma.tailoredResume.findMany({
    where: { jobId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      isCurrent: true,
      validationStatus: true,
      renderStatus: true,
      createdAt: true,
    },
  });
}

/**
 * Tailor the base resume for a job (Phase 2.2). Requires an existing
 * JobAnalysis — tailor builds on actual analysis, never raw postings alone.
 * Only validated output persists; JobMatch.score is never touched.
 */
export async function tailorResume(
  jobId: string,
  provider: LlmProvider = getDefaultProvider(),
): Promise<{ tailored: TailoredResumeData & { id: string }; cached: false }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: true, analysis: true },
  });
  if (!job) throw new Error(`job not found: ${jobId}`);
  if (!job.analysis) throw new NeedsAnalysisError();

  const { base, content } = await requireBaseResumeContent();

  const { evidence, evidenceById } = collectEvidencePair(content);

  const prompt = buildTailorPrompt({
    jobTitle: job.title,
    companyName: job.company.name,
    location: job.location,
    analysisSummary: job.analysis.summary,
    requiredSkills: job.analysis.requiredSkills,
    missingSkills: job.analysis.missingSkills,
    verdict: job.analysis.verdict,
    evidence,
  });

  const raw = await generateJsonSanitized(
    provider,
    TAILOR_SYSTEM_PROMPT,
    prompt,
  );
  const { data, raw: validRaw } = await parseWithSingleRetry({
    schema: tailoredResumeSchema,
    raw,
    jobId,
    logTag: "tailor",
    provider,
    systemPrompt: TAILOR_SYSTEM_PROMPT,
    prompt,
    makeError: (detail) => new TailorValidationError(detail),
  });

  return persistValidated(
    jobId,
    base.id,
    data,
    evidenceById,
    validRaw,
    content,
  );
}

async function persistValidated(
  jobId: string,
  baseResumeId: string,
  data: TailoredResumeData,
  evidenceById: Map<string, string>,
  raw: unknown,
  baseContent: ResumeData,
): Promise<{ tailored: TailoredResumeData & { id: string }; cached: false }> {
  // Canonical boundary: validate + persist the canonical shape so the
  // renderer never sees model field-name variants. Raw output kept for audit.
  const canonical = canonicalizeTailored(data);
  const problems = validateTailoredResume(
    { sections: canonical.sections } as TailoredResumeData,
    evidenceById,
    // Skills lists are validated by set equality (reordering is legitimate),
    // which requires the base resume to resolve the cited skills item.
    baseContent,
  );
  if (problems.length > 0) {
    console.error(
      `[tailor] provenance invalid for job ${jobId}: ${JSON.stringify(problems).slice(0, 1000)}`,
    );
    throw new TailorValidationError(problems.map((p) => p.text).join("; "));
  }
  const saved = await prisma.$transaction(async (tx) => {
    const max = await tx.tailoredResume.aggregate({
      where: { jobId },
      _max: { version: true },
    });
    const version = (max._max.version ?? 0) + 1;
    // Demote first, then create — exactly one isCurrent per job.
    await tx.tailoredResume.updateMany({
      where: { jobId, isCurrent: true },
      data: { isCurrent: false },
    });
    return tx.tailoredResume.create({
      data: {
        jobId,
        version,
        isCurrent: true,
        baseResumeId,
        content: canonical as object,
        evidenceIds: [...evidenceById.keys()],
        rawJson: raw as object,
      },
    });
  });
  return {
    tailored: {
      sections: canonical.sections,
      id: saved.id,
      version: saved.version,
    } as TailoredResumeData & { id: string; version: number },
    cached: false as const,
  };
}
