<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:calm-focus-design -->

# Design: Calm Focus (LOCKED)

User chose Concept C via Lavish (2026-09-04). Before touching UI, read
`DESIGN_CALM_FOCUS.md` and follow it. Do NOT reintroduce Neo-Brutalism
(thick black borders, hard shadows, 150ms snaps, 3-column OS grid).
Single centered column, hairlines only, 900ms `cubic-bezier(.16,1,.3,1)`,
minimal text.
<!-- END:calm-focus-design -->

# Job Search — agent guide

A single-user, local-first job application system. It ingests postings, ranks
them, tailors a resume with evidence, renders an ATS-checked PDF, and gets you
to the apply page. There is no auth layer; never expose it publicly.

This file is the entry point for agents. Read it before changing code or data.

## Golden rules

1. **Every LLM claim must trace to base-resume evidence.** Items carry
   `provenance.sourceIds`; unknown IDs, invented skills, and changed facts must
   fail validation. Never weaken this to make a flow pass.
2. **Persist only validated output.** Invalid model JSON → one repair retry →
   502 and nothing written.
3. **`JobMatch.score` is deterministic and immutable.** No LLM flow reads or
   writes it. Match and verdict stay side by side.
4. **Source adapters never touch Prisma.** They return `RawJob[]`; the pipeline
   validates with Zod and upserts idempotently.
5. **All page queries go through `src/lib/repositories/`.**
6. **UI is locked to Calm Focus.** See `DESIGN_CALM_FOCUS.md`.
7. **Never expose secrets.** `.env` is gitignored; provider API keys are entered
   only in Settings → AI providers and stay in browser localStorage. The job
   modal only selects a saved connection/model.

## Quick commands

```bash
bun install
bun run check:env       # doctor: env, provider, sources, digest
bun run audit           # machine-readable install health (jobs visible? base resume?)
bun run smoke:llm       # one provider call; proves model auth + JSON
bun run smoke:flow      # analyze → tailor → validate → PDF → cover
bun run db:migrate      # apply Prisma migrations
bun run dev             # http://localhost:3000
bun run test            # unit only (no DB)
bun run test:integration# DB-backed (needs DATABASE_URL)
bun run test:e2e        # Playwright on port 3100 with deterministic fixtures
```

## Agent CLI (preferred interface)

Use this instead of clicking through the UI. It prints exactly one JSON object
and uses stable exit codes.

```bash
bun run agent -- status
bun run agent -- jobs list --limit 10 --query Go
bun run agent -- jobs show <jobId>

bun run agent -- analyze <jobId>
bun run agent -- tailor <jobId>
bun run agent -- validate <jobId>
bun run agent -- pdf <jobId>
bun run agent -- cover <jobId>

bun run agent -- decision <jobId> --status SAVED|APPLIED|QUEUED|OPENED|SKIPPED
bun run agent -- ingest
bun run agent -- nightly --top 25
bun run agent -- profile
bun run agent -- resumes
bun run agent -- smoke
```

- Add `--refresh` to re-run a step instead of returning the cached row.
- Success: `{ "ok": true, "command": "...", "data": ... }`.
- Failure: `{ "ok": false, "error": { "name", "message", "detail" } }`.
- Exit codes: `0` ok, `2` usage, `3` not found, `4` prerequisite/validation,
  `5` LLM/provider, `1` other.
- Machine contract lives in `scripts/agent.ts`. Extend it when adding a feature;
  do not create one-off scripts for agents.

## HTTP API (when `bun run dev` is running)

All routes are unauthenticated and local-only.

| Method   | Route                        | Purpose                                                       |
| -------- | ---------------------------- | ------------------------------------------------------------- |
| GET      | `/api/jobs`                  | search/filter (`q`, `location`, `workMode`, `skills`, `page`) |
| GET      | `/api/jobs/:id`              | one job                                                       |
| GET      | `/api/jobs/:id/state`        | all panel artifacts in one request                            |
| POST     | `/api/llm/models`            | validate key + list provider models                           |
| GET/POST | `/api/jobs/:id/analyze`      | cached / run analysis                                         |
| GET/POST | `/api/jobs/:id/tailor`       | cached / run tailoring                                        |
| GET/POST | `/api/jobs/:id/validate`     | cached / semantic validation                                  |
| GET/POST | `/api/jobs/:id/pdf`          | PDF state / render + ATS                                      |
| GET      | `/api/jobs/:id/pdf/download` | download rendered PDF                                         |
| GET/POST | `/api/jobs/:id/cover`        | cover letter                                                  |
| GET/POST | `/api/jobs/:id/decision`     | tracker state                                                 |
| POST     | `/api/jobs/:id/liveness`     | apply-URL check                                               |
| POST     | `/api/jobs/import`           | import one job by URL                                         |
| GET      | `/api/cron/ingest`           | ingestion run                                                 |
| GET      | `/api/cron/nightly`          | ingest + match + digest                                       |
| GET/PUT  | `/api/profile`               | the single profile                                            |
| GET/POST | `/api/resumes`               | resume list/create                                            |
| GET/POST | `/api/llm/test`              | provider check                                                |

`POST` flows accept `?refresh=1`. Prerequisite failures are `422`; provider or
validation failures are `502`; missing rows are `404`.

## Recipes

**Find work worth applying to**

```bash
bun run agent -- ingest
bun run agent -- jobs list --limit 20
```

**Run the full application loop**

```bash
bun run agent -- analyze <jobId>
bun run agent -- tailor <jobId>
bun run agent -- validate <jobId>      # must be SEMANTIC_VALID before PDF
bun run agent -- pdf <jobId>
bun run agent -- cover <jobId>
bun run agent -- decision <jobId> --status APPLIED
```

**Diagnose "nothing works"**

```bash
bun run check:env
bun run audit
bun run smoke:llm
```

- `visible: 0` + `total > 0` → jobs are older than 30 days or fail classification.
  Run ingestion. Visibility uses `COALESCE(postedAt, scrapedAt)`.
- `smoke:llm` 401/expired → run `opencode auth login` or set `OPENCODE_MODEL`
  to an authenticated provider (this machine uses `google/gemini-3.5-flash`).
- `422` on tailor → no `JobAnalysis`; run analyze first.
- `422` on PDF → tailored resume is not `SEMANTIC_VALID`; run validate first.
- `EmptyResumeError` → `Profile.baseResumeId` missing or resume has no sections.

## Data flow

```text
sources → RawJob (Zod) → ingestion pipeline → Job (+ searchVector)
                                     │
Profile, Resume ─────────────────────┼──→ matcher → JobMatch / NightlyRun / digest
                                     │
Job → Analyze → JobAnalysis
    → Tailor  → TailoredResume (STRUCTURAL_VALID, evidence IDs)
    → Validate→ SEMANTIC_VALID | SEMANTIC_INVALID
    → PDF     → storage/pdfs/... + ATS result (only SEMANTIC_VALID)
    → Cover   → persisted validated artifact
    → Decision → tracker
```

Key files: `src/lib/{sources,ingestion,matching,analysis,tailor,cover,pdf,repositories}/`,
`prisma/schema.prisma`, `docs/architecture.md`, `docs/schema.md`.

## Environment

```bash
DATABASE_URL=postgres...          # required
LLM_PROVIDER=cloud                # optional; otherwise OpenCode CLI
LLM_API_KEY / LLM_MODEL / LLM_BASE_URL
LLM_API_MODE=chat|responses        # responses for OpenCode Muse models
OPENCODE_MODEL=google/gemini-3.5-flash   # pin the local CLI model
OPENCODE_BIN / OPENCODE_AGENT
CRON_SECRET                       # optional; protects cron routes
ADZUNA_APP_ID / ADZUNA_APP_KEY / JOOBLE_API_KEY  # optional sources
PDF_BACKEND=typst|latex
RESEND_API_KEY / DIGEST_TO_EMAIL / DIGEST_FROM_EMAIL
```

`bun run check:env` is authoritative. The OpenCode CLI’s global model may point
at an expired credential; pinning `OPENCODE_MODEL` is intentional. OpenCode Go
Muse Spark models use the Responses API: base URL
`https://opencode.ai/inference/go/openai/v1`, mode `responses`, model
`muse-spark-1.3-contributor`.

## Local deployment status

- Target: one user on one machine. No auth, no multi-tenancy.
- PDFs are written under `storage/` on local disk (gitignored).
- Background work is route-shaped (`/api/cron/*`); schedule ingestion/nightly
  with `scripts/schedule-nightly.ps1` (Windows) or a cron entry. There is no
  `vercel.json`.
- Do not deploy as-is: routes are open, PDF storage is ephemeral, and the
  OpenCode CLI is local-only.

## Tests

- Unit: `bun run test` (mocked providers, no DB).
- Integration: `bun run test:integration` (real Postgres, long timeouts).
- E2E: `bun run test:e2e` — port **3100**, seeds three deterministic jobs when
  the DB has none, cleans them in teardown. Never point E2E at a foreign server.
- Add an E2E spec for user-visible behavior; add integration coverage for
  service contracts. Do not add DB tests to the unit suite.
- `bun run smoke:flow` verifies all five LLM flows on one real job.
- The current evidence file is `docs/verified-local.md`.

## Change checklist

1. Does the change preserve the evidence/provenance and persist-only-validated
   rules?
2. Does it keep `JobMatch.score` untouched?
3. Did you update `scripts/agent.ts` and this file if the agent surface changed?
4. Did you run `bun run lint && bun run typecheck && bun run test`?
5. For UI: did you follow `DESIGN_CALM_FOCUS.md`?
6. For data: did you add a Prisma migration?
