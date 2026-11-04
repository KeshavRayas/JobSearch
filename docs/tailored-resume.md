# Tailored resumes

On-demand resume tailoring with evidence provenance, an editable draft, explicit
approval, and an ATS-checked PDF. No cover letters, no interview prep.

## Base resume = evidence set

`Resume.content` (structured `ResumeData`) is the only facts source. It is
transcribed once from `ResumeLatex.tex` via `scripts/seed-resume-content.ts` —
stable item/bullet IDs (`summary_01`, `bullet_erp_02`, …) are the citable
evidence. `collectEvidence()` flattens items; per-bullet IDs come from the
`bullet_xx_NN:` prefixes stored in the seed.

## Flow

```text
Queue a job (Apply) → /apply/[id] full-screen workspace
  → job fit, required skills, AI verdict, and model selector in the left pane
  → [Analyze & Tailor Resume] (one click; analysis runs first when missing)
  → POST /api/jobs/:id/tailor
  → tailorResume(): base resume + job + analysis → configured provider
  → Zod shape check (+ one repair retry) → canonicalize
  → enrich factual fields from the base resume (company, dates, school,
    project names/technologies, skills) → provenance warnings, never a hard stop
  → persist TailoredResume version as DRAFT (v1, v2, …; one current)

Changes mode → green additions/rewrites, red removed base text
  → [Edit] click any text in the document → [Save draft]
  → PUT /api/jobs/:id/tailor { sections }
  → schema-validated, enriched, status back to DRAFT
  → PDF/ATS state cleared because the content changed

[Revert to base] → POST /api/jobs/:id/revert
  → creates a new DRAFT from the base resume; previous versions stay in history

[Approve resume]
  → persist current edits → POST /api/jobs/:id/approve
  → status APPROVED

[Open application] (unlocked only after approval)
  → records OPENED and opens the company page; no autofill
[I've applied]
  → records APPLIED explicitly
```

`GET /api/jobs/:id/tailor` returns the saved current draft (`cached: true`).
`?refresh=1` on `POST` runs the model again and creates a new version.

## Provenance contract

Every tailored item carries `{ sourceIds[], change }` where change is
`UNCHANGED | REWRITE | REORDER | COMBINE`. The model may reorder and rephrase but
never invent: no new skills, employers, numbers, dates, or degrees. Known gaps
from the analysis stay visible.

`validateTailoredResume` (deterministic, no model) reports:

- required sections present (summary, experience, education, skills)
- every sourceId exists in the base evidence set; no duplicate item IDs
- verbatim check for UNCHANGED/REORDER on flat-text kinds
  (summary/skills/custom); skills lists use set equality so relevance
  reordering passes but add/drop fails

In the draft flow these issues become `TailoredResume.warnings[]` and render in
the editor as “Review these before approving.” They never auto-approve and are
cleared when the user saves edits.

Skills are facts, not prose: `copySkillsFromBase` overwrites tailored skill lists
with the cited base item’s exact strings. The model never edits skills.

## Change map (review only)

`src/lib/tailor/diff.ts` compares base fields to the current tailored fields:

- summary: word-level LCS against the non-contact base summary
- experience/projects: logical bullets reconstructed from PDF-extracted lines,
  then matched to tailored bullets by token overlap; projects scope the base
  bullets to the ones cited by that project
- green = added or significantly rewritten; red = removed base text
- minor tense/article edits stay plain to keep the review readable
- `Changes / Edit / Final` modes; green/red never reach the PDF

The diff is deterministic and model-free. Editing switches the document to the
plain editable surface; Final hides the red “before” lines.

## Resume document (editable)

The draft is rendered as the document the user will send, not as a form:
centered name/contact header from the profile, uppercase section rules, serif
body, hanging bullets, categorized skills. `ResumeDocument` makes each visible
field a click-to-edit `contenteditable` element; the generic item fields remain
the save/PDF source of truth.

`enrichTailoredData` fills facts the model often omits: company, dates, school
location, GPA, project names/technologies, and the exact skills list. Project
titles are recovered from the cited base-resume bullets, so no project names are
hardcoded.

## PDF + ATS checks (no model calls)

```text
APPROVED → canonicalize → render → PDF (storage/pdfs/)
  → pdfjs-dist extract → runAtsChecks → persist → UI checklist + download
```

`POST /api/jobs/:id/pdf` returns `422` unless the current version is `APPROVED`.
Render failures persist `renderStatus = FAILED` without touching content. ATS
warnings never block the PDF.

Renderer: Typst via WASM (`src/lib/pdf/typst.ts` emits data + `#import` against
`assets/resume-template.typ`, compiled by `compileTypst` in
`src/lib/pdf/compile.ts`; Libertinus Serif vendored in `assets/fonts` — no TeX
install, no network, ~0.5s compiles). All presentation lives in the template
file — TS only serializes strings (backslash + quote escaping), so template
tweaks never touch code. `PDF_BACKEND=latex` restores the legacy pdflatex path
(`renderLatex` + `compileLatex`).

Separate state fields (no mega-enum): `renderStatus` (PENDING/SUCCESS/FAILED),
`atsStatus` (PENDING/CHECKED) + `atsResult` + `pdfPath`. Postgres stays
canonical — `storage/` is gitignored, PDFs regenerate from content. ATS result
is concrete checks (extractable, sections 4/4, 7/10 skills, warnings), never a
universal score.

## Versioning and failure semantics

1. **Versioning**: `(jobId, version)` identity + `isCurrent`, exactly one current
   per job (transaction: demote then create). Re-tailor and revert never
   overwrite. PDF paths carry the version.
2. **Failure preservation** (DB-backed tests): analyze/tailor persist only after
   schema validation; PDF failure marks FAILED without touching content;
   re-tailor failure keeps the old version byte-identical.
3. **Apply lifecycle**: `ApplicationDecision` (QUEUED/OPENED/APPLIED/SAVED/
   SKIPPED). Opening the URL records OPENED only; APPLIED requires the explicit
   “I’ve applied” confirmation.
4. **Apply-time liveness** (`POST /api/jobs/:id/liveness`): HEAD, GET fallback,
   5s timeout, dead-page markers. No persistence, no crawling.
5. **Calibration**: `humanVerdict` + `judgedAt` on `JobMatch`, observational
   only (ranking ignores them). `bunx tsx scripts/judge-queue.ts` prints the
   table; `--rate <jobId> <EXCELLENT|GOOD|BAD>` records.
