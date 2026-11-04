# Job Search

A local-first end-to-end job application platform. It ingests postings from
seven sources, ranks them, tailors an editable resume draft, renders an
ATS-checked PDF once you approve it, and opens the company's apply page so you
can mark the application as submitted. No accounts, no multi-tenancy.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind 4
- Prisma 7 + Neon Postgres (`@prisma/adapter-pg`)
- Zod contracts at every boundary
- Resend for the nightly digest
- Typst compiled to WASM for PDFs (LaTeX is an optional fallback)
- LLM: local OpenCode CLI by default, any OpenAI-compatible endpoint via env

## Quick start

**Prerequisites**

- [Bun](https://bun.sh) 1.3+ (package manager and script runner)
- Node 22+ (Next.js runtime)
- A Postgres database — [Neon](https://neon.tech) free tier is what this was
  built against
- The [OpenCode CLI](https://opencode.ai) if you want the free local LLM path
  (otherwise set `LLM_PROVIDER=cloud` with an API key)

```bash
bun install
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
# edit .env: at minimum DATABASE_URL
bun run setup                 # env check + migrations + curated companies
bun run dev
```

`bun run setup` is idempotent. It prints exactly what is still missing
(profile, base resume, provider).

Open http://localhost:3000. Operations live at `/ops`; the machine-readable
health check is `/api/health`.

### First-run checklist

1. **Settings** → fill in your name, contact details, skills, locations,
   salary floor, and work modes. This is what resumes, PDFs, and matching read.
2. **Resumes** → upload or create a base resume. Structured content is the
   evidence set that tailoring cites.
3. **Discover** → press Refresh to run ingestion, or import a single job by URL.
4. **Nightly** → `bun run ingest` refreshes sources; the nightly matcher is
   triggered by `GET /api/cron/nightly` (see Scheduling).

Ingestion works without Adzuna/Jooble keys: those two adapters are skipped and
the five keyless sources still run.

## Agent CLI

Every product action has one machine-readable entry point:

```bash
bun run agent -- status
bun run agent -- jobs list --limit 10
bun run agent -- analyze <jobId>
bun run agent -- tailor <jobId>
bun run agent -- approve <jobId>
bun run agent -- pdf <jobId>
bun run agent -- decision <jobId> --status APPLIED
bun run agent -- ingest
bun run agent -- nightly
```

Each command prints one JSON object (`{ ok, command, data }`) and exits `0`
on success with stable failure codes. Add `--refresh` to bypass cached rows.
The full contract, recipes, and failure playbook are in
[`AGENTS.md`](./AGENTS.md).

## Daily loop

```text
Discover → Apply (queue) → Analyze & Tailor → edit the resume document → Approve → Open application → I've applied → Tracker
```

Every LLM step is opt-in and validates its JSON with Zod before persisting.
Tailoring produces an editable resume document; only your explicit approval
unlocks PDF rendering and the company application link. No LLM flow mutates
`JobMatch.score`. Deterministic matching and the LLM verdict sit side by side.

## LLM providers

| Provider     | How                                        | Where it works |
| ------------ | ------------------------------------------ | -------------- |
| OpenCode CLI | shells out to `opencode run --format json` | local only     |
| Cloud (BYOK) | any OpenAI-compatible `/chat/completions`  | anywhere       |

- Local default: whatever model OpenCode is configured with. Pin it explicitly
  with `OPENCODE_MODEL` (this machine uses `google/gemini-3.5-flash`); override
  the binary with `OPENCODE_BIN` or the agent with `OPENCODE_AGENT`.
- If the pinned provider returns `401 api_key_expired`, run
  `opencode auth login` or switch `OPENCODE_MODEL`; `bun run smoke:llm` proves
  the path in one call.
- `LLM_PROVIDER=cloud` needs `LLM_API_KEY` + `LLM_MODEL`; optional
  `LLM_BASE_URL`, `LLM_API_MODE` (`chat` or `responses`), `LLM_TIMEOUT_MS`.
  OpenCode Go's Muse Spark models require `LLM_API_MODE=responses` and the
  `https://opencode.ai/inference/go/openai/v1` base URL.
- The app supports multiple browser-local provider connections, managed only in
  **Settings → AI providers**. Add an OpenCode Go (or other) key once; saving
  discovers the provider’s model list. Then pick one of those models in the job
  panel. Keys never go to the server and are never logged.
- The job panel no longer contains a key form or a free-text model field.

## Scheduling

The routes are cron-shaped, not cron-configured. Locally, trigger them yourself:

```bash
bun run agent -- ingest     # ingestion pipeline
bun run agent -- nightly    # ingest + match + digest
```

If `CRON_SECRET` is set, send `Authorization: Bearer $CRON_SECRET`. On Windows,
run `powershell -File scripts/schedule-nightly.ps1` to register a daily 02:00
task (or point Task Scheduler at `bun run agent -- nightly`). `/ops` shows the
last ingestion and nightly results. There is no `vercel.json`; this project is
not deployed.

## Scripts

| Command                    | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `bun run dev`              | Next.js dev server                            |
| `bun run build`            | Production build                              |
| `bun run lint`             | ESLint                                        |
| `bun run typecheck`        | `tsc --noEmit`                                |
| `bun run check`            | lint + typecheck + Prettier check             |
| `bun run check:env`        | Validate `.env`, mask secrets, show providers |
| `bun run setup`            | Env check + migrations + seed (idempotent)    |
| `bun run audit`            | JSON install health (visibility, base resume) |
| `bun run smoke:llm`        | One provider call; verifies auth + JSON       |
| `bun run smoke:flow`       | Full analyze→approve→PDF flow on one job      |
| `bun run agent -- <cmd>`   | Agent CLI (see `AGENTS.md`)                   |
| `bun run db:migrate`       | Apply Prisma migrations                       |
| `bun run db:status`        | Migration status                              |
| `bun run seed`             | Seed curated companies                        |
| `bun run ingest`           | Run ingestion once                            |
| `bun run test`             | Unit tests (no database)                      |
| `bun run test:integration` | DB-backed tests (needs `DATABASE_URL`)        |
| `bun run test:e2e`         | Playwright end-to-end suite                   |
| `bun run test:watch`       | Vitest watch mode                             |

## Layout

```text
src/app/                 routes (discover, job detail, tracker, resumes, settings, ops, api)
src/components/          UI (Calm Focus design + resume document)
src/lib/sources/         one adapter per job board
src/lib/ingestion/       normalize → validate → dedupe → upsert
src/lib/matching/        deterministic scoring + nightly digest
src/lib/analysis/        job analysis service
src/lib/tailor/          tailoring, provenance warnings, draft + approval
src/lib/pdf/             Typst/LaTeX render + ATS checks
src/lib/llm/             provider abstraction, BYOK, retries
src/lib/repositories/    all Prisma reads for pages
scripts/                 setup, audit, ingest, agent CLI, smoke checks
prisma/                  schema + migrations
docs/                    architecture, schema, per-phase contracts
e2e/                     Playwright specs
```

## Tests

- `bun run test` — 16 files, pure unit tests, no DB, ~4s.
- `bun run test:integration` — DB-backed service tests; writes and deletes its
  own rows. Uses longer timeouts because Neon is remote.
- `bun run test:e2e` — 17 Playwright tests against a dev server and the same
  database. Specs are serial by design and share fixtures. The draft spec mocks
  provider calls; it proves click-to-edit → save → approve → PDF gating.

Current verified state (commands, counts, live flow): see
[`docs/verified-local.md`](./docs/verified-local.md).

## Design

The UI is locked to **Calm Focus**; read
[`DESIGN_CALM_FOCUS.md`](./DESIGN_CALM_FOCUS.md) before changing anything
visual. Single centered column, hairlines only, Instrument Serif + Inter,
900 ms entrances, minimal text. Neo-Brutalism is explicitly out.

## Performance

- Opening a job is client-side: no server round trip, no list refetch. Measured
  ~40ms to open the modal after hydration.
- The detail panel loads analysis, the current draft, and the decision from one
  endpoint (`GET /api/jobs/:id/state`) instead of separate calls.
- Job searches are cached for 15s under the `jobs` tag and revalidated on
  ingestion; warm homepage responses are ~0.4s locally.
- The list count is returned by the same SQL query via `COUNT(*) OVER()`.

## Known limits

- Single user. There is no auth, and `/api/*` is open to anyone who can reach
  the server. Do not expose it publicly.
- PDFs are written to `storage/` on the local filesystem (gitignored).
- The local LLM path requires the OpenCode CLI on the same host as the app.
- Adzuna and Jooble require free API keys; the other five sources do not.
- The nightly digest needs `RESEND_API_KEY` + `DIGEST_TO_EMAIL`.
