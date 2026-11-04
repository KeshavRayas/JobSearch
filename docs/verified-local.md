# Verified local state

Recorded 2026-11-04 on branch `finish/local-first`.

This is the evidence that the local product works end to end. Re-run the
commands; do not trust this file over current output.

## Environment

- Database: Neon Postgres, 13 migrations applied.
- Provider: OpenCode CLI, pinned `OPENCODE_MODEL=google/gemini-3.5-flash`.
- Jobs: 33 visible (Greenhouse 20, Ashby 11, Lever 1, Remotive 1).

## Gates

| Gate        | Command                             | Result                     |
| ----------- | ----------------------------------- | -------------------------- |
| Lint        | `bun run lint`                      | pass                       |
| Types       | `tsc --noEmit`                      | pass                       |
| Format      | `prettier --check .`                | pass                       |
| Unit        | `bun run test`                      | 228 passed / 18 files      |
| Integration | `bun run test:integration`          | 17 passed / 2 files        |
| E2E         | `bun run test:e2e`                  | 16 passed                  |
| Build       | `bun run build`                     | pass, all routes           |
| Prod health | `bun run start` + `GET /api/health` | 200, `ok:true`             |
| Nightly     | `bun run agent -- nightly`          | 45 candidates, 25 matched  |
| Setup       | `bun run setup`                     | migrations + seed + report |
| Audit       | `bun run audit`                     | `ok:true`, 33/33 visible   |

## Live flow (fresh job `o1gMoCevGRZR5d0EMyXUE`)

```text
analyze   → JobAnalysis persisted
tailor    → version 1, STRUCTURAL_VALID
validate  → SEMANTIC_VALID, issues: []
pdf       → SUCCESS, storage/pdfs/o1gMoCevGRZR5d0EMyXUE_v1.pdf
            ATS: all sections found
cover     → persisted, evidence ids resolve
interview → persisted, gaps bridged from analysis.missingSkills
download  → GET /api/jobs/:id/pdf/download → 200 application/pdf (32,590 bytes)
```

Total flow time with the CLI provider: 164.9s. Reproduce with
`bun run smoke:flow`.

The previous verification job (`VOJ3381CG_ApHYoXMMFUX`) was removed by the
nightly stale-job cleanup, which correctly cascaded its tailored resume, PDF
row, cover letter, and interview prep. That is expected: stale jobs do not keep
artifacts.

Both failures found during this pass are fixed:

1. `validateTailoredResume` never received the base resume, so skill
   reordering was rejected as `TEXT_MISMATCH`.
2. The tailoring prompt allowed an item to borrow facts from evidence it did
   not cite, so semantic validation correctly rejected a summary that added
   PyTorch/TensorFlow without citing the skills evidence. The prompt now
   requires citing every evidence item used.

## Agent surface

```bash
bun run agent -- status
bun run agent -- jobs list --limit 5
bun run agent -- tailor <jobId>
bun run agent -- validate <jobId>
bun run agent -- pdf <jobId>
bun run agent -- cover <jobId>
bun run agent -- interview <jobId>
```

JSON shape `{ ok, command, data }`; exit codes 0/2/3/4/5.

## Not verified

- Resend digest: no `RESEND_API_KEY` / `DIGEST_TO_EMAIL` configured.
- Adzuna/Jooble: no API keys; both adapters skipped by design.
- Nightly run timing depends on live sources; `/ops` and `NightlyRun` show the
  result.
