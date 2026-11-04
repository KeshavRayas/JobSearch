import { z } from "zod";

// ─── Tailored resume contract (Phase 2.2) ────────────────────────────────────
// The model operates on STRUCTURED resume content (never PDF/.tex) and every
// tailored item cites its evidence: base-resume item IDs it was derived from.
// Deterministic validation (validate.ts) enforces the provenance rule; LLM
// semantic validation arrives in Phase 2.3.

export const changeTypeSchema = z.enum([
  "UNCHANGED",
  "REWRITE",
  "REORDER",
  "COMBINE",
]);

export const provenanceSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1).max(10),
  change: changeTypeSchema,
});

const fieldValueSchema = z.union([
  z.string().max(5000),
  z.boolean(),
  z.array(z.string().max(2000)).max(50),
]);

export const tailoredItemSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum([
    "summary",
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "custom",
  ]),
  fields: z.record(z.string(), fieldValueSchema),
  provenance: provenanceSchema,
});

export const tailoredSectionSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(50),
  title: z.string().max(200),
  items: z.array(tailoredItemSchema).min(1).max(30),
});

export const tailoredResumeSchema = z.object({
  sections: z.array(tailoredSectionSchema).min(1).max(20),
});

export type TailoredResumeData = z.infer<typeof tailoredResumeSchema>;
export type TailoredItem = z.infer<typeof tailoredItemSchema>;

/** Section types the tailored resume must preserve from the base resume. */
export const REQUIRED_SECTION_TYPES = [
  "summary",
  "experience",
  "education",
  "skills",
];

export const TAILOR_SYSTEM_PROMPT = [
  "Answer DIRECTLY in this response. Do NOT use any tools. Do NOT explore files. Do NOT run commands.",
  "Your entire reply must be ONLY a JSON object matching the requested shape.",
  "Every factual claim must come from the EVIDENCE items below. Citing a source ID you were not given is forbidden.",
  "Cite EVERY evidence item a fact comes from. If you mention a skill, tool, employer, number, or date that appears in a different evidence item than the one you started with, add that evidence ID to sourceIds.",
  "Forbidden: new skills, new employers, new numbers, new dates, new degrees. If the evidence lacks something the job wants, leave the gap visible — never invent it.",
].join(" ");

export interface TailorPromptInput {
  jobTitle: string;
  companyName: string;
  location?: string | null;
  analysisSummary: string;
  requiredSkills: string[];
  missingSkills: string[];
  verdict: string;
  evidence: { id: string; kind: string; text: string }[];
}

export function buildTailorPrompt(input: TailorPromptInput): string {
  const evidenceBlock = input.evidence
    .map((e) => `[${e.id} | ${e.kind}] ${e.text}`)
    .join("\n");
  return [
    "Rewrite the resume below for the JOB, using the ANALYSIS. Keep every section. Reorder bullets so the most relevant come first. Rewrite wording to mirror the posting's keywords WITHOUT changing facts.",
    "Every tailored item needs provenance: sourceIds (evidence IDs used) and change (UNCHANGED | REWRITE | REORDER | COMBINE).",
    "sourceIds must include EVERY evidence item you took a fact from — not just the first one. If the summary mentions a skill that lives in a skills evidence item, cite that skills item too.",
    "Skills lists may be reordered by relevance but must keep exactly the same skills — never add or drop one.",
    "If an item mentions a technology or skill, cite the evidence item that contains it. Do not mention skills that are absent from that item's own evidence.",
    "Return ONLY this JSON shape and nothing else:",
    '{"sections": [{"id": string, "type": string, "title": string, "items": [{"id": string, "kind": "summary"|"experience"|"education"|"skills"|"projects"|"certifications"|"custom", "fields": object, "provenance": {"sourceIds": string[], "change": "UNCHANGED"|"REWRITE"|"REORDER"|"COMBINE"}}]}]}',
    "Example item:",
    '{"id": "exp_erp", "kind": "experience", "fields": {"title": "Software Intern", "bullets": ["Built backend APIs with PostgreSQL."]}, "provenance": {"sourceIds": ["bullet_erp_02"], "change": "REWRITE"}}',
    "",
    `JOB: ${input.jobTitle} at ${input.companyName} (${input.location ?? "location n/a"})`,
    `ANALYSIS: ${input.analysisSummary}`,
    `Required: ${input.requiredSkills.join(", ") || "none listed"}`,
    `Known gaps (leave visible, do not fill): ${input.missingSkills.join(", ") || "none"}`,
    `Verdict: ${input.verdict}`,
    "",
    "EVIDENCE (only facts you may use):",
    evidenceBlock,
    "",
    "Reminder: no tools. Reply with ONLY the JSON object.",
  ].join("\n");
}
