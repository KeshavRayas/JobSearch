# Verified local state

Recorded 2026-11-04 on branch `finish/local-first`.

This is the evidence that the local product works end to end. Re-run the
commands; do not trust this file over current output.

## Environment

- Database: Neon Postgres, 15 migrations applied.
- Provider: OpenCode Go **Responses API**, model `muse-spark-1.3-contributor`
  (configured in `.env`; key never committed).
- Jobs: 45 visible (Greenhouse 20, Ashby 23, Lever 1, Remotive 1).
- The local OpenCode CLI is currently broken on this machine
  (`no such column: project_id`); the app bypasses it via the cloud provider.

## Scope

Discover/rank jobs, analyze, tailor an **editable draft**, approve it, render an
ATS-checked PDF, then open the company apply page and mark the application as
submitted. Cover letters and interview prep are out of scope (cover letters
removed 2026-11-04).

## Gates

| Gate        | Command                           | Result                     |
| ----------- | --------------------------------- | -------------------------- |
| Lint        | `bun run lint`                    | pass, 0 warnings           |
| Types       | `tsc --noEmit`                    | pass                       |
| Format      | `prettier --check .`              | pass                       |
| Unit        | `bun run test`                    | 198 passed / 15 files      |
| Integration | `bun run test:integration`        | 10 passed / 1 file         |
| E2E         | `bun run test:e2e`                | 17 passed                  |
| Build       | `bun run build`                   | pass, all routes           |
| Muse Spark  | live tailor + PDF (Responses API) | full loop, ~2.2 min tailor |
| Draft gate  | `POST /api/jobs/:id/pdf` on DRAFT | 422, explicit message      |
| Audit       | `bun run audit`                   | 45/45 visible              |

## Live flow (job `iDyCTPl2oe1TkOYCy0L3E`, 2026-11-04)

```text
tailor    → HTTP 201, status DRAFT, 5 sections, 0 warnings
edit      → PUT /tailor with one changed summary field → 200, DRAFT
approve   → POST /approve → 200, status APPROVED
pdf       → HTTP 201, renderStatus SUCCESS, atsStatus CHECKED
            storage/pdfs/iDyCTPl2oe1TkOYCy0L3E_v1.pdf
            keyword coverage 17.65%
reopen    → PUT /tailor → status DRAFT again
pdf gate  → 422 {"error":"refusing to render: status is DRAFT, approve the
            resume draft first"}
re-approve→ 200
```

The edited text survived save and approval byte-for-byte. The PDF was rendered
only after approval.

## Muse Spark 1.3 Contributor (2026-11-04)

Verified through OpenCode Go's **Responses API**, not chat completions:

- endpoint `https://opencode.ai/inference/go/openai/v1/responses`
- model `muse-spark-1.3-contributor`
- required headers: bearer key + `x-opencode-session`
- tailor call usage: prompt 2,343 tokens, completion 11,431 tokens
- provider returned **28 discoverable models**; `muse-spark-1.3-contributor`
  appears in Settings and the job modal lists the actual model names.

## Retired validation path

The previous strict LLM semantic validator (`SEMANTIC_VALID` /
`SEMANTIC_INVALID`) was removed with the draft pivot. It produced false failures
such as `contact_main marked UNCHANGED but text differs from rs_1_...` on
editable, legitimate resume text. Provenance checks now surface as draft
warnings; the user decides what to approve. `src/lib/tailor/semantic.ts` and its
test were deleted.

## Agent surface

```bash
bun run agent -- status
bun run agent -- jobs list --limit 5
bun run agent -- analyze <jobId>
bun run agent -- tailor <jobId>
bun run agent -- approve <jobId>
bun run agent -- pdf <jobId>
bun run agent -- decision <jobId> --status APPLIED
```

JSON shape `{ ok, command, data }`; exit codes 0/2/3/4/5.

## Not verified

- Resend digest: no `RESEND_API_KEY` / `DIGEST_TO_EMAIL` configured.
- Adzuna/Jooble: no API keys; both adapters skipped by design.
- Nightly run timing depends on live sources; `/ops` and `NightlyRun` show the
  result.
