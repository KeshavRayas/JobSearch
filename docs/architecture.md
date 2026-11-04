# Architecture

## What this is

A single-user, local-first job search application. The browser is a thin UI over
server components; all state lives in Postgres. Long-running work (ingestion,
nightly matching) runs as HTTP routes that can be triggered manually or by a
scheduler.

## Tech stack

| Layer      | Choice                                           |
| ---------- | ------------------------------------------------ |
| Frontend   | Next.js 16.2 App Router, React 19.2, Tailwind 4  |
| Language   | TypeScript 5                                     |
| Database   | Neon Postgres                                    |
| ORM        | Prisma 7 (`@prisma/adapter-pg` + `pg`)           |
| Validation | Zod 4 at every external boundary                 |
| Email      | Resend (nightly digest)                          |
| PDF        | Typst via WASM; optional local `pdflatex`        |
| LLM        | OpenCode CLI (local) or OpenAI-compatible HTTP   |
| Tests      | Vitest (unit + DB integration), Playwright (E2E) |

There is no Redis, no auth layer, and no background worker. Those are deliberate:
the target is one user on one machine.

## Runtime shape

```text
Browser
  │
  ▼
Next.js Server Component / Route Handler
  │
  ├── src/lib/repositories/*      ← all page queries
  ├── src/lib/{analysis,tailor,cover,interview}/service.ts
  ├── src/lib/matching/nightly.ts
  └── src/lib/ingestion/pipeline.ts
  │
  ▼
Prisma (PrismaPg adapter) → Neon Postgres
```

- Server Components read through repositories; they never call `prisma` directly.
- LLM services depend on the `LlmProvider` interface, never on a concrete
  provider.
- PDF artifacts are written under `storage/` and referenced by relative path in
  the database.

## Data flow: ingestion

```text
GET /api/cron/ingest
  → JobSource[] (src/lib/sources)
      Adzuna, Jooble, Remotive, Greenhouse, Lever, Ashby, Workday
  → RawJob[] normalized + Zod-validated
  → cheap filters (CS, entry level, location)
  → dedupe on @@unique([externalId, source])
  → upsert Job + to_tsvector(searchVector)
  → JobIngestionLog per payload, SourceSync per source
```

Each source is isolated with `allSettled` and retried in-run (3 attempts,
backoff in `src/lib/jobs/retry.ts`). Sources without credentials are skipped.
Manual imports (`POST /api/jobs/import`) go through the same gates and persist
with `source = MANUAL`.

## Data flow: nightly matching

```text
GET /api/cron/nightly
  → runIngestionPipeline()
  → runMatching(topN = 25)
      candidates: ACTIVE, classificationScore ≥ 0.70, posted ≤ 30d
      hard filters: role-family veto, location INELIGIBLE
      scoreJob() (pure): skills .40, role .15, level .12, recency .08,
                         source .08, salary .07, location .10
  → upsert JobMatch with every score component + reasons
  → NightlyRun stats
  → Resend digest (Top 25)
```

Matching is deterministic and model-free. `JobMatch.score` is never read or
written by any LLM flow.

## Data flow: LLM features

All five flows share one shape:

```text
explicit user action
  → build prompt from persisted context (never re-fetch the world)
  → provider.generateJson()
  → Zod shape check (+ one repair retry)
  → deterministic validation (evidence IDs, verbatim checks, gates)
  → persist only if valid; otherwise 502 and nothing is written
```

```text
Job → Analyze        → JobAnalysis
Job → Tailor         → TailoredResume (STRUCTURAL_VALID) → evidence checks
    → Validate       → SEMANTIC_VALID / SEMANTIC_INVALID
    → PDF            → storage/pdfs + ATS result (SEMANTIC_VALID only)
    → Cover letter   → CoverLetter
    → Interview prep → InterviewPrep
```

Provider selection lives in `getDefaultProvider()`:

- `LLM_PROVIDER=cloud` → `CloudJsonProvider` (HTTPS, requires key + model).
- anything else → `OpencodeCliProvider` (spawns `opencode run --format json`).

BYOK: the job panel can store `{provider, baseUrl, model, key}` in localStorage
and bypass the shared provider for that browser.

## Engineering rules

1. Source adapters never touch Prisma — they return `RawJob[]`.
2. Every external payload is normalized to `RawJob` and Zod-validated.
3. Ingestion is idempotent: `@@unique([externalId, source])` + `upsert`.
4. Prisma queries for pages live in `src/lib/repositories/`.
5. Zod validates API bodies, query params, model output, and env.
6. LLMs may rephrase but never invent: evidence IDs must resolve against the
   base resume, and failures persist nothing.
7. Presentation tokens live in `src/app/globals.css`; the design system in
   `DESIGN_CALM_FOCUS.md` is locked.

## Storage and artifacts

- `storage/pdfs/{jobId}_v{version}.pdf` — rendered resumes (gitignored).
- `JobIngestionLog.rawPayload` — raw source payloads for debugging.
- No object storage, no CDN. Back up the database, not the filesystem.

## Failure behavior

- Ingestion: per-source isolation; a dead feed does not sink the run.
- LLM: typed `LlmError`; one repair retry on invalid JSON; then 502.
- PDF: render failure marks `renderStatus = FAILED` without touching content.
- ATS: warnings never block the PDF (the PDF is the artifact being checked).
- Missing env: `requireEnv` fails fast with a fixable message; `check:env`
  reports the full configuration.

## Scale notes

Optimized for one user: 10k–50k jobs, a few hundred matches per run, page
queries bounded by `pageSize ≤ 100`. Caches are in-process and short-lived.
If this ever becomes multi-user or public, the required changes are auth,
per-user repositories, object storage for PDFs, rate limiting, and a real job
queue — explicitly out of scope today.
