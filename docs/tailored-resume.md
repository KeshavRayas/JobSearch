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
Select job (needs JobAnalysis, else 422) → [Tailor Resume]
  → POST /api/jobs/:id/tailor
  → tailorResume(): base resume + job + analysis → configured provider
  → Zod shape check (+ one repair retry) → canonicalize
  → provenance checks become warnings, never a hard failure
  → persist TailoredResume version as DRAFT (v1, v2, …; one current)

Edit any field → [Save draft]
  → PUT /api/jobs/:id/tailor { sections }
  → schema-validated, canonicalized, status back to DRAFT
  → PDF/ATS state cleared because the content changed

[Approve resume]
  → persist current edits → POST /api/jobs/:id/approve
  → status APPROVED

[Render PDF]
  → POST /api/jobs/:id/pdf (422 unless APPROVED)
  → render → extract → ATS checks; failures never touch content
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
   per job (transaction: demote then create). Re-tailor never overwrites. PDF
   paths carry the version.
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
