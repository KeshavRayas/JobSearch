import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { canonicalizeTailored } from "@/lib/tailor/canonical";
import { tailoredResumeSchema } from "@/lib/tailor/contract";
import { renderLatex } from "@/lib/pdf/latex";
import { renderTypst } from "@/lib/pdf/typst";
import { compileLatex, compileTypst, RenderError } from "@/lib/pdf/compile";
import { extractPdfText, runAtsChecks, type AtsResult } from "@/lib/pdf/ats";
import { getOrCreateDefaultProfile } from "@/lib/matching/profile";

export class NotApprovedError extends Error {
  constructor(status: string) {
    super(
      `refusing to render: status is ${status}, approve the resume draft first`,
    );
    this.name = "NotApprovedError";
  }
}

export class NothingToRenderError extends Error {
  constructor() {
    super("tailor the resume before rendering — no TailoredResume found");
    this.name = "NothingToRenderError";
  }
}

function pdfDir(): string {
  return path.join(process.cwd(), "storage", "pdfs");
}

export function pdfPathFor(jobId: string, version: number): string {
  return path.join("storage", "pdfs", `${jobId}_v${version}.pdf`);
}

/**
 * Render a SEMANTIC_VALID tailored resume → PDF → extraction → ATS checks.
 * No model calls. ATS warnings never block the PDF: the PDF is what is
 * being checked, so render → extract → check, in that order.
 */
export async function renderPdf(jobId: string): Promise<{
  pdfPath: string;
  ats: AtsResult;
}> {
  const tailored = await prisma.tailoredResume.findFirst({
    where: { jobId, isCurrent: true },
    orderBy: { version: "desc" },
  });
  if (!tailored) throw new NothingToRenderError();
  if (tailored.status !== "APPROVED") {
    throw new NotApprovedError(tailored.status);
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { analysis: true },
  });
  if (!job) throw new Error(`job not found: ${jobId}`);

  // Defensive canonicalization (idempotent). New rows are already canonical
  // from the tailor boundary; this covers rows persisted before 2.4.
  const parsed = tailoredResumeSchema.safeParse(tailored.content);
  if (!parsed.success) {
    await markFailed(jobId, "stored tailored content is not valid");
    throw new RenderError("stored tailored content failed schema check", "");
  }
  const canonical = canonicalizeTailored(parsed.data);
  if (canonical.sections.length === 0) {
    await markFailed(jobId, "no sections to render");
    throw new RenderError("no sections to render", "");
  }

  // Ensure a default profile exists for downstream matching reads.
  await getOrCreateDefaultProfile();
  const fullProfile = await prisma.profile.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  const contact = {
    name: fullProfile?.name ?? "Candidate",
    location: (fullProfile?.locations ?? []).join(" / ") || "Bangalore",
    email: fullProfile?.email,
    phone: fullProfile?.phone,
    linkedin: fullProfile?.linkedin,
    github: fullProfile?.github,
  };

  // PDF_BACKEND=latex restores the pdflatex path. Typst (WASM, vendored
  // fonts) is the default: no TeX install, millisecond compiles.
  const backend = process.env.PDF_BACKEND === "latex" ? "latex" : "typst";

  let pdf: Buffer;
  try {
    ({ pdf } =
      backend === "typst"
        ? await compileTypst(renderTypst(canonical, contact))
        : await compileLatex(renderLatex(canonical, contact)));
  } catch (err) {
    const log = err instanceof RenderError ? err.log : String(err);
    await markFailed(jobId, log.slice(-1000));
    throw err;
  }

  const dir = pdfDir();
  await mkdir(dir, { recursive: true });
  const rel = pdfPathFor(jobId, tailored.version);
  await writeFile(path.join(process.cwd(), rel), pdf);

  const requiredSkills =
    job.analysis && job.analysis.requiredSkills.length > 0
      ? job.analysis.requiredSkills
      : job.skills;
  let ats: AtsResult;
  try {
    const text = await extractPdfText(pdf);
    ats = runAtsChecks(text, requiredSkills, {
      contactEmail: fullProfile?.email,
    });
  } catch (err) {
    ats = {
      textExtractable: false,
      charCount: 0,
      sections: {
        summary: false,
        experience: false,
        education: false,
        skills: false,
      },
      requiredSkillsFound: 0,
      requiredSkillsTotal: requiredSkills.length,
      matchedKeywords: [],
      missingKeywords: [...requiredSkills],
      keywordCoverage: 0,
      warnings: [
        `extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  await prisma.tailoredResume.update({
    where: { id: tailored.id },
    data: {
      renderStatus: "SUCCESS",
      renderedAt: new Date(),
      pdfPath: rel,
      atsStatus: "CHECKED",
      atsResult: ats as object,
      atsCheckedAt: new Date(),
    },
  });

  return { pdfPath: rel, ats };
}

async function markFailed(jobId: string, detail: string): Promise<void> {
  const current = await prisma.tailoredResume.findFirst({
    where: { jobId, isCurrent: true },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!current) return;
  await prisma.tailoredResume.update({
    where: { id: current.id },
    data: { renderStatus: "FAILED", renderedAt: new Date() },
  });
  console.error(
    `[pdf] render failed for job ${jobId}: ${detail.slice(0, 500)}`,
  );
}

export async function getPdfState(jobId: string) {
  const tailored = await prisma.tailoredResume.findFirst({
    where: { jobId, isCurrent: true },
    orderBy: { version: "desc" },
  });
  if (!tailored) throw new NothingToRenderError();
  return {
    status: tailored.status,
    renderStatus: tailored.renderStatus,
    renderedAt: tailored.renderedAt,
    hasPdf: tailored.renderStatus === "SUCCESS" && tailored.pdfPath !== null,
    atsStatus: tailored.atsStatus,
    atsResult: tailored.atsResult,
    atsCheckedAt: tailored.atsCheckedAt,
  };
}
