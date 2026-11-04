import { prisma } from "@/lib/prisma";
import {
  ANALYZE_SYSTEM_PROMPT,
  buildAnalyzePrompt,
  jobAnalysisSchema,
  type JobAnalysisData,
} from "@/lib/analysis/jobAnalysis";
import { getOrCreateDefaultProfile } from "@/lib/matching/profile";
import { scoreJob } from "@/lib/matching/score";
import { OpencodeCliProvider } from "@/lib/llm/opencode";
import { CloudJsonProvider } from "@/lib/llm/cloud";
import type { LlmProvider } from "@/lib/llm/types";
import { generateJsonSanitized } from "@/lib/llm/sanitize";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`job not found: ${jobId}`);
    this.name = "JobNotFoundError";
  }
}

export class AnalysisValidationError extends Error {
  constructor(detail: string) {
    super(`model returned invalid analysis: ${detail}`);
    this.name = "AnalysisValidationError";
  }
}

export class EmptyProfileError extends Error {
  constructor() {
    super(
      "Profile.skills is empty — add your skills to the default Profile before analyzing jobs",
    );
    this.name = "EmptyProfileError";
  }
}

let defaultProvider: LlmProvider | null = null;

export function getDefaultProvider(): LlmProvider {
  if (!defaultProvider) {
    // LLM_PROVIDER=cloud selects the hosted endpoint (works on Vercel).
    // Anything else keeps the free local OpenCode CLI passthrough.
    defaultProvider =
      process.env.LLM_PROVIDER === "cloud"
        ? new CloudJsonProvider()
        : new OpencodeCliProvider();
  }
  return defaultProvider;
}

/** For tests: inject a stub provider. */
export function setDefaultProvider(provider: LlmProvider | null): void {
  defaultProvider = provider;
}

export async function getAnalysis(jobId: string) {
  return prisma.jobAnalysis.findUnique({ where: { jobId } });
}

/**
 * Analyze a job on demand. Persists JobAnalysis (upsert by jobId).
 * Never reads or writes JobMatch.score — deterministic and LLM verdicts
 * stay side by side in the UI.
 */
export async function analyzeJob(
  jobId: string,
  provider: LlmProvider = getDefaultProvider(),
): Promise<{ analysis: JobAnalysisData & { id: string }; cached: false }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: true },
  });
  if (!job) throw new JobNotFoundError(jobId);

  const profile = await getOrCreateDefaultProfile();

  // Analyzing without candidate skills burns a model call to produce a punt
  // ("no profile provided"). Fail fast with a human-actionable error instead.
  if (profile.skills.length === 0) {
    throw new EmptyProfileError();
  }

  // Send the relevant profile slice, not a 40-item dump: deterministic
  // overlap first (matched), then a bounded remainder. Keeps the prompt
  // focused and the model honest about what was actually supplied.
  const overlap = scoreJob(
    profile,
    {
      skills: job.skills,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      postedAt: job.postedAt,
      source: job.source,
      sourceScore: job.sourceScore,
      experience: job.experience,
      title: job.title,
    },
    new Date(),
  );
  const remainder = profile.skills
    .filter((s) => !overlap.matchedSkills.includes(s))
    .sort()
    .slice(0, 12);
  const promptSkills = [...overlap.matchedSkills, ...remainder];

  const prompt = buildAnalyzePrompt({
    title: job.title,
    companyName: job.company.name,
    description: job.description,
    location: job.location,
    workMode: job.workMode,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurr: job.salaryCurr,
    jobSkills: job.skills,
    profileSkills: promptSkills,
    profileMinSalary: profile.minSalary,
  });

  const raw = await generateJsonSanitized(
    provider,
    ANALYZE_SYSTEM_PROMPT,
    prompt,
  );
  let parsed = jobAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    // One repair retry: show the model its validation errors and ask for
    // corrected JSON only. Still no persistence unless it validates.
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    console.error(
      `[analyze] first attempt invalid for job ${jobId}: ${issues}`,
    );
    console.error(
      `[analyze] rejected payload: ${JSON.stringify(raw).slice(0, 1000)}`,
    );
    const retry = await generateJsonSanitized(
      provider,
      ANALYZE_SYSTEM_PROMPT,
      `Your previous output failed validation with these errors: ${issues}\nReturn ONLY the corrected JSON object in exactly the requested shape, no other text.\n\n---\n\n${prompt}`,
    );
    parsed = jobAnalysisSchema.safeParse(retry);
    if (!parsed.success) {
      throw new AnalysisValidationError(
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
    }
    return persistAnalysis(jobId, parsed.data, retry);
  }
  return persistAnalysis(jobId, parsed.data, raw);
}

async function persistAnalysis(
  jobId: string,
  data: JobAnalysisData,
  raw: unknown,
): Promise<{ analysis: JobAnalysisData & { id: string }; cached: false }> {
  const shared = {
    summary: data.summary,
    responsibilities: data.responsibilities,
    requiredSkills: data.requiredSkills,
    preferredSkills: data.preferredSkills,
    matchedSkills: data.matchedSkills,
    missingSkills: data.missingSkills,
    experienceRequirements: data.experienceRequirements,
    potentialConcerns: data.potentialConcerns,
    workAuthorization: data.workAuthorization ?? null,
    workMode: data.workMode ?? null,
    verdict: data.verdict,
    verdictReasons: data.verdictReasons,
    rawJson: raw as object,
  };
  const saved = await prisma.jobAnalysis.upsert({
    where: { jobId },
    update: shared,
    create: { jobId, ...shared },
  });

  return { analysis: { ...data, id: saved.id }, cached: false as const };
}
