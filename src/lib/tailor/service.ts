import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  TAILOR_SYSTEM_PROMPT,
  buildTailorPrompt,
  tailoredResumeSchema,
  type TailoredResumeData,
} from "@/lib/tailor/contract";
import { collectEvidencePair } from "@/lib/tailor/evidence";
import { validateTailoredResume } from "@/lib/tailor/validate";
import { canonicalizeTailored } from "@/lib/tailor/canonical";
import { enrichTailoredData, baseToTailoredData } from "@/lib/tailor/document";
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

export class NothingToEditError extends Error {
  constructor() {
    super("tailor a resume before editing it");
    this.name = "NothingToEditError";
  }
}

export class NothingToApproveError extends Error {
  constructor() {
    super("tailor a resume before approving it");
    this.name = "NothingToApproveError";
  }
}

export class DraftValidationError extends Error {
  constructor(detail: string) {
    super(`resume draft failed validation: ${detail}`);
    this.name = "DraftValidationError";
  }
}

export { setDefaultProvider };

export type TailoredDraftView = TailoredResumeData & {
  id: string;
  version: number;
  baseResumeId: string;
  status: "DRAFT" | "APPROVED";
  warnings: string[];
};

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

function draftView(
  row: {
    id: string;
    version: number;
    baseResumeId: string;
    status: "DRAFT" | "APPROVED";
    warnings: string[];
    content: unknown;
  },
  versionCount?: number,
): (TailoredDraftView & { versionCount?: number }) | null {
  const parsed = tailoredResumeSchema.safeParse(row.content);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    id: row.id,
    version: row.version,
    baseResumeId: row.baseResumeId,
    status: row.status,
    warnings: row.warnings,
    ...(versionCount !== undefined ? { versionCount } : {}),
  };
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
  const parsed = tailoredResumeSchema.safeParse(current.content);
  if (!parsed.success) return null;
  const base = await prisma.resume.findUnique({
    where: { id: current.baseResumeId },
  });
  const enriched = base?.content
    ? enrichTailoredData(parsed.data, base.content as unknown as ResumeData)
    : parsed.data;
  const view = draftView({ ...current, content: enriched }, versionCount);
  if (!view) return null;
  return {
    ...view,
    content: current.content,
    renderStatus: current.renderStatus,
    renderedAt: current.renderedAt,
    pdfPath: current.pdfPath,
    atsStatus: current.atsStatus,
    atsResult: current.atsResult,
    atsCheckedAt: current.atsCheckedAt,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
  };
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
      status: true,
      renderStatus: true,
      createdAt: true,
    },
  });
}

/**
 * Tailor the base resume for a job. Requires an existing JobAnalysis.
 * Produces an editable DRAFT; provenance problems become warnings, not a
 * hard failure. JobMatch.score is never touched.
 */
export async function tailorResume(
  jobId: string,
  provider: LlmProvider = getDefaultProvider(),
): Promise<{ tailored: TailoredDraftView; cached: false }> {
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

  return persistDraft(jobId, base.id, data, evidenceById, validRaw, content);
}

async function persistDraft(
  jobId: string,
  baseResumeId: string,
  data: TailoredResumeData,
  evidenceById: Map<string, string>,
  raw: unknown,
  baseContent: ResumeData,
): Promise<{ tailored: TailoredDraftView; cached: false }> {
  const canonical = canonicalizeTailored(data);
  copySkillsFromBase(canonical, baseContent);
  const enriched = enrichTailoredData(
    canonical as unknown as TailoredResumeData,
    baseContent,
  );
  const warnings = validateTailoredResume(
    enriched,
    evidenceById,
    baseContent,
  ).map((issue) => issue.text);

  if (warnings.length > 0) {
    console.warn(
      `[tailor] draft warnings for job ${jobId}: ${JSON.stringify(warnings).slice(0, 1000)}`,
    );
  }

  const saved = await prisma.$transaction(async (tx) => {
    const max = await tx.tailoredResume.aggregate({
      where: { jobId },
      _max: { version: true },
    });
    const version = (max._max.version ?? 0) + 1;
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
        content: enriched as object,
        evidenceIds: [...evidenceById.keys()],
        status: "DRAFT",
        warnings,
        rawJson: raw as object,
      },
    });
  });

  const view = draftView(saved);
  if (!view) throw new TailorValidationError("draft could not be read back");
  return { tailored: view, cached: false };
}

/** Persist user edits to the current draft. Editing reopens a draft. */
export async function saveTailoredDraft(
  jobId: string,
  input: unknown,
): Promise<TailoredDraftView> {
  const current = await prisma.tailoredResume.findFirst({
    where: { jobId, isCurrent: true },
    orderBy: { version: "desc" },
  });
  if (!current) throw new NothingToEditError();

  const parsed = tailoredResumeSchema.safeParse(input);
  if (!parsed.success) {
    throw new DraftValidationError(
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  }
  const canonical = canonicalizeTailored(parsed.data);
  // Recompute warnings so unresolved issues stay visible after a partial edit.
  let warnings: string[] = [];
  const base = await getBaseResume();
  const baseContent = base?.content as ResumeData | null;
  let enriched = canonical as TailoredResumeData;
  if (baseContent && hasResumeContent(baseContent)) {
    enriched = enrichTailoredData(
      canonical as unknown as TailoredResumeData,
      baseContent,
    );
    const { evidenceById } = collectEvidencePair(baseContent);
    warnings = validateTailoredResume(enriched, evidenceById, baseContent).map(
      (issue) => issue.text,
    );
  }
  const updated = await prisma.tailoredResume.update({
    where: { id: current.id },
    data: {
      content: enriched as object,
      status: "DRAFT",
      warnings,
      renderStatus: "PENDING",
      renderedAt: null,
      pdfPath: null,
      atsStatus: "PENDING",
      atsResult: Prisma.DbNull,
      atsCheckedAt: null,
    },
  });
  const view = draftView(updated);
  if (!view) throw new DraftValidationError("draft could not be read back");
  return view;
}

/** Lock the draft and allow PDF rendering. */
export async function approveTailoredResume(
  jobId: string,
): Promise<TailoredDraftView> {
  const current = await prisma.tailoredResume.findFirst({
    where: { jobId, isCurrent: true },
    orderBy: { version: "desc" },
  });
  if (!current) throw new NothingToApproveError();
  const updated = await prisma.tailoredResume.update({
    where: { id: current.id },
    data: { status: "APPROVED" },
  });
  const view = draftView(updated);
  if (!view) throw new NothingToApproveError();
  return view;
}

/**
 * Create a new draft from the base resume. The previous versions stay in
 * history, so reverting is reversible.
 */
export async function revertTailoredResume(
  jobId: string,
): Promise<TailoredDraftView> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true },
  });
  if (!job) throw new Error(`job not found: ${jobId}`);

  const { base, content } = await requireBaseResumeContent();
  const baseDraft = baseToTailoredData(content);
  const enriched = enrichTailoredData(baseDraft, content);

  const saved = await prisma.$transaction(async (tx) => {
    const max = await tx.tailoredResume.aggregate({
      where: { jobId },
      _max: { version: true },
    });
    const version = (max._max.version ?? 0) + 1;
    await tx.tailoredResume.updateMany({
      where: { jobId, isCurrent: true },
      data: { isCurrent: false },
    });
    return tx.tailoredResume.create({
      data: {
        jobId,
        version,
        isCurrent: true,
        baseResumeId: base.id,
        content: enriched as object,
        evidenceIds: [],
        status: "DRAFT",
        warnings: [],
      },
    });
  });

  const view = draftView(saved);
  if (!view)
    throw new DraftValidationError("base draft could not be read back");
  return view;
}

/**
 * Skills are facts, not prose. The model may reorder bullets and rewrite the
 * summary, but the skills field is copied verbatim from the cited base item.
 */
function copySkillsFromBase(
  canonical: ReturnType<typeof canonicalizeTailored>,
  base: ResumeData,
): void {
  const byId = new Map<string, { category: string; skills: string[] }>();
  for (const section of base.sections ?? []) {
    if (section.type !== "skills") continue;
    for (const item of section.items ?? []) {
      const record = item as unknown as {
        id?: string;
        category?: string;
        skills?: unknown;
      };
      if (!record.id || !Array.isArray(record.skills)) continue;
      byId.set(record.id, {
        category: record.category ?? "Skills",
        skills: record.skills.filter((s): s is string => typeof s === "string"),
      });
    }
  }
  if (byId.size === 0) return;

  for (const section of canonical.sections) {
    for (const item of section.items) {
      if (item.kind !== "skills") continue;
      const sourceId = item.provenance.sourceIds.find((id) => byId.has(id));
      const source = sourceId ? byId.get(sourceId) : undefined;
      if (!source) continue;
      item.fields = {
        ...item.fields,
        category: source.category,
        skills: source.skills,
      };
    }
  }
}
