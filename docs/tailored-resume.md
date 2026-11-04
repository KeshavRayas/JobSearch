# Tailored resumes (Phase 2.2)

On-demand resume tailoring with evidence provenance. No LLM semantic
validation yet (Phase 2.3), no PDF (Phase 2.4).

## Base resume = evidence set

`Resume.content` (structured `ResumeData`) is the only facts source.
Transcribed once from `ResumeLatex.tex` via `scripts/seed-resume-content.ts`
— stable item/bullet IDs (`summary_01`, `bullet_erp_02`, …) are the citable
evidence. `collectEvidence()` flattens items; per-bullet IDs come from the
`bullet_xx_NN:` prefixes stored in the seed.

## Flow

```text
Select job (needs JobAnalysis, else 422) → [Tailor Resume]
  → POST /api/jobs/:id/tailor
  → tailorResume(): base resume + job + analysis → free model
  → Zod shape check → deterministic provenance validation
  → persist TailoredResume (upsert by jobId) → diff UI
GET returns the saved tailored resume (cached:true). ?refresh=1 re-runs.
```

## Provenance contract

Every tailored item carries `{ sourceIds[], change }` where change is
`UNCHANGED | REWRITE | REORDER | COMBINE`. The model may reorder and
rephrase but never invent: no new skills, employers, numbers, dates,
degrees. Known gaps from the analysis stay visible.

Deterministic gate (`validateTailoredResume`, no model):

- required sections present (summary, experience, education, skills)
- every sourceId exists in the base evidence set, no duplicates
- verbatim check for UNCHANGED/REORDER on flat-text kinds
  (summary/skills/custom); skills lists use set equality so
  relevance-reordering passes but add/drop fails
- structured kinds (experience/projects/education) defer semantic
  equality to Phase 2.3 LLM validation

Failures → 502, nothing persists. `JobMatch.score` is never touched.

## Semantic validation (Phase 2.3)

Judge-only LLM pass over persisted tailored resumes:

```text
[Tailor Resume] → [Check Evidence] → POST /api/jobs/:id/validate
  → validator: tailored items × base evidence (job description NEVER sent)
  → { valid, issues[] } with UNSUPPORTED_CLAIM | INFLATED_CLAIM |
     NEW_TECHNOLOGY | NEW_METRIC | ROLE_MISMATCH × LOW | MEDIUM | HIGH
  → any HIGH forces invalid → persist status + result + validatedAt
GET returns the stored verdict (404 until first validation).
```

Durable state on `TailoredResume`: `STRUCTURAL_VALID` (2.2 gate) →
`SEMANTIC_VALID` / `SEMANTIC_INVALID`. Phase 2.4 may only render
`SEMANTIC_VALID` rows. Adversarial fixtures live in
`src/__tests__/semantic.test.ts` (8 shapes: honest/inflated/new-tech/
new-metric/combined/JD-inference all covered at contract level).

## PDF + ATS checks (Phase 2.4, no model calls)

```text
SEMANTIC_VALID → canonicalize → render → PDF (storage/pdfs/)
  → pdfjs-dist extract → runAtsChecks → persist → UI checklist + download
POST /api/jobs/:id/pdf (422 unless SEMANTIC_VALID; render failures persist
FAILED without touching content). ATS warnings never block the PDF.
```

Renderer: Typst via WASM (`src/lib/pdf/typst.ts` emits data + `#import`
against `assets/resume-template.typ`, compiled by `compileTypst` in
`src/lib/pdf/compile.ts`; Libertinus Serif vendored in `assets/fonts` —
no TeX install, no network, ~0.5s compiles). All presentation lives in the
template file — TS only serializes strings (backslash + quote escaping),
so template tweaks never touch code. `PDF_BACKEND=latex`
restores the legacy pdflatex path (`renderLatex` + `compileLatex`).

Separate state fields (no mega-enum): `renderStatus` (PENDING/SUCCESS/FAILED),
`atsStatus` (PENDING/CHECKED) + `atsResult` + `pdfPath`. Postgres stays
canonical — `storage/` is gitignored, PDFs regenerate from content.
ATS result is concrete checks (extractable, sections 4/4, 7/10 skills,
warnings), never a universal score.

## Hardening + workflow semantics (Phase 2.5)

1. **Failure preservation** (`src/__tests__/workflow.test.ts`, DB-backed):
   analyze/tailor upsert only after validation; PDF failure marks FAILED
   without touching content; re-tailor failure keeps the old version
   byte-identical. Fixed a real JSONB key-reordering bug found this way
   (`evidenceText` now iterates sorted keys).
2. **Versioning**: `(jobId, version)` identity + `isCurrent`, exactly one
   current per job (transaction: demote then create). Re-tailor never
   overwrites. PDF paths carry the version.
3. **Apply lifecycle**: `ApplicationDecision` (QUEUED/OPENED/APPLIED/SAVED/
   SKIPPED). Opening the URL records OPENED only; APPLIED needs the explicit
   confirmation. Footer redesigned around this.
4. **Apply-time liveness** (`POST /api/jobs/:id/liveness`): HEAD, GET
   fallback, 5s timeout, dead-page markers. No persistence, no crawling.
5. **Calibration**: `humanVerdict` + `judgedAt` on `JobMatch`,
   observational only (ranking ignores them). `bunx tsx scripts/judge-queue.ts`
   prints the table; `--rate <jobId> <EXCELLENT|GOOD|BAD>` records.
