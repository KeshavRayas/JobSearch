# Database schema

Single-user database. No `User`, `Session`, or `Account` tables — there is no
auth layer. Fourteen models, grouped by responsibility.

## Enums

| Enum                     | Values                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| `JobSource`              | ADZUNA, JOOBLE, REMOTIVE, GREENHOUSE, LEVER, ASHBY, WORKDAY, MANUAL      |
| `CompanyType`            | STARTUP, MNC                                                             |
| `ExperienceLevel`        | ENTRY, MID, SENIOR, LEAD                                                 |
| `JobType`                | FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP                               |
| `WorkMode`               | REMOTE, HYBRID, ONSITE                                                   |
| `JobStatus`              | ACTIVE, REJECTED                                                         |
| `RejectionReason`        | NON_CS, NON_ENTRY_LEVEL, UNKNOWN_EXPERIENCE, INVALID_LOCATION, DUPLICATE |
| `SalaryFit`              | MATCH, BELOW, UNKNOWN                                                    |
| `AnalysisVerdict`        | STRONG, POSSIBLE, WEAK                                                   |
| `DecisionStatus`         | QUEUED, OPENED, APPLIED, SAVED, SKIPPED                                  |
| `TailorValidationStatus` | STRUCTURAL_VALID, SEMANTIC_VALID, SEMANTIC_INVALID                       |
| `RenderStatus`           | PENDING, SUCCESS, FAILED                                                 |
| `AtsStatus`              | PENDING, CHECKED                                                         |

## Core domain

### Company

Curated list seeded from `src/lib/constants.ts`. `slug` is unique; `atsType` +
`atsBoard` tell the Greenhouse/Lever/Ashby/Workday adapters where to fetch.

### Job

One posting. Identity is `@@unique([externalId, source])`, so re-ingestion
updates instead of duplicating. Key fields: `title`, `description`, `applyUrl`,
`location`, `workMode`, `salaryMin/Max`, `jobType`, `experience`, `skills[]`,
`postedAt`, `scrapedAt`, `status`, `classificationScore`, `rejectionReason`,
`sourceScore`, and `searchVector` (full-text). Relations: one company, optional
match/analysis/decision/cover letter/interview prep, many tailored resumes.

### SearchEvent

Blind write of each query typed on the discover page, used for signal counts.
Timestamp-indexed.

## Profile and resumes

### Profile

The single onboarding row. Everything else reads from it:

- `name`, `email`, `phone`, `linkedin`, `github` — resume/PDF contact block.
- `skills[]` — matching and prompt context.
- `minSalary`, `locations[]`, `workModes[]`, `openToRemote` — eligibility.
- `preferredRoleFamilies[]`, `vetoedRoleFamilies[]` — matcher v2 role goals.
- `dealbreakers[]` — free-form notes carried into prompts.
- `baseResumeId` — pins the evidence source so tailoring never depends on
  timestamp ordering.

Editable at `/settings` (`GET`/`PUT /api/profile`).

### Resume

Base resume. `content` is structured `ResumeData` with stable item IDs
(`summary_01`, `bullet_erp_02`, …) that serve as the citable evidence set.
`skills[]` is denormalized for fast profile seeding.

## Matching and tracking

### NightlyRun

One matcher execution: `startedAt`, `finishedAt`, `fetched`, `scored`,
`matched`, `success`, `error`. Matches retain history through `nightlyRunId`.

### JobMatch

Deterministic score for a job, unique per job. Stores the full breakdown rather
than just the number: `score`, `matchedSkills`, `missingSkills`, `skillOverlap`,
`salaryFit`, `salaryScore`, `recencyDecay`, `recencySource`, `sourceTrust`,
`levelFit`, `roleFamily`, `roleFit`, `locationFit`, `reasons[]`. Human
calibration fields: `humanVerdict`, `judgedAt`, `judgmentContext`.

### ApplicationDecision

Tracker state, unique per job: `status`, `reason`, `decidedAt`. Updated from the
job panel, read by `/tracker`.

## LLM artifacts

### JobAnalysis

On-demand analysis, unique per job: summary, responsibilities, required and
preferred skills, matched/missing skills, experience requirements, concerns,
work authorization/mode, verdict (`STRONG|POSSIBLE|WEAK`), verdict reasons.
`rawJson` keeps the model output for audit.

### TailoredResume

Versioned, `isCurrent` pointer, unique on `@@unique([jobId, version])`. Stores
the evidence-bearing content and the two-stage validation state:
`validationStatus`, `validationResult`, `validatedAt`; then render state:
`renderStatus`, `renderedAt`, `pdfPath`, `atsStatus`, `atsResult`,
`atsCheckedAt`.

### CoverLetter

Unique per job. `content` is the validated letter, `evidenceIds[]` must resolve
against the base resume, `rawJson` for audit.

### InterviewPrep

Unique per job. `content` holds technical/resume/behavioral questions, STAR
stories, questions to ask, and gap bridges; `evidenceIds[]` validated the same
way.

## Observability

### SourceSync

One row per source per ingestion run: `startedAt`, `finishedAt`, `jobsFetched`,
`jobsCreated`, `jobsUpdated`, `success`, `error`. This is the source-health log.

### JobIngestionLog

Raw payload per fetched posting (`rawPayload` JSON) plus `processed` flag.
Debugging and replay source; indexed on `(source, createdAt)`.

## Indexes worth knowing

- `Job`: unique `(externalId, source)`; indexes on source, postedAt, companyId,
  workMode, location, status, jobType, experience, createdAt, sourceScore; GIN
  on `skills`.
- `JobMatch`: index on score and nightlyRunId.
- `TailoredResume`: index on `(jobId, isCurrent)`; unique `(jobId, version)`.
- `SearchEvent`: createdAt. `JobIngestionLog`: `(source, createdAt)`.

Full-text search uses `searchVector` written during ingestion
(`to_tsvector`); see `src/lib/repositories/jobs.repository.ts`.
