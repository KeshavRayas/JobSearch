# Job analysis on demand (Phase 2A)

Morning flow, model only on explicit user action:

```text
Select job → [Analyze Job] → POST /api/jobs/:id/analyze
  → analyzeJob(): job + relevant profile slice → free model
  → Zod validate → persist JobAnalysis (upsert by jobId) → display
GET returns the saved analysis (cached:true). POST with ?refresh=1 re-runs.
```

Rules:

- Analysis never reads or writes `JobMatch.score`. Deterministic match and
  LLM verdict stay side by side in the UI.
- Empty `Profile.skills` → 422 ("add your skills first"), no model call.
- Invalid model JSON → one repair retry, then 502. Nothing persists
  unless it validates.
- Prompt carries the relevant profile slice (deterministic overlap first,
  then ≤12 more), not the full skill list.

## Provider: OpenCode CLI passthrough

`OpencodeCliProvider` shells out to `opencode run --format json` with a
direct-answer prompt, parses the last JSON object from text events, and
throws typed `LlmError`s. Swap via the `LlmProvider` interface
(`OPENCODE_AGENT` forces an agent, `OPENCODE_BIN` a binary path,
`LLM_TIMEOUT_MS` the timeout).

**Local-only by default.** The route spawns the CLI on its host, so Analyze works
under local `bun run dev`, never on Vercel. Everything else is unaffected.

## Hosted provider (Phase 4A) + BYOK (Phase 5A)

`LLM_PROVIDER=cloud` selects `CloudJsonProvider` (`src/lib/llm/cloud.ts`):
any OpenAI-compatible `/chat/completions` endpoint over HTTPS, so all five
flows (analyze, tailor, validate, cover, interview) work on Vercel through
the same `getDefaultProvider()` factory — no route or service changes.
Requires `LLM_API_KEY` + `LLM_MODEL` (pinned by the operator, never
defaulted); optional `LLM_BASE_URL`, `LLM_TIMEOUT_MS`. Every call logs
model + token usage; the 422 pre-gates and persist-only-validated rules
still bound spend. Anything else keeps the free local CLI passthrough.

BYOK lets the user bring their own key instead of waiting on the shared
quota: the panel stores `{provider, baseUrl, model, key}` in localStorage
and sends it per request (`x-llm-key/model/base-url/label`). The server
(`resolveProvider` in `src/lib/llm/userKey.ts`) prefers the user key, then
env, then CLI — the key is never persisted or logged. `POST /api/llm/test`
validates a key with one tiny call before the UI saves it. Long calls show
elapsed seconds + Cancel (AbortController); results carry token usage.

## Gotchas found the hard way (do not regress)

1. `stdio: ["ignore", ...]` — an open stdin pipe makes `opencode run` hang
   until our own timeout kills it.
2. No shell on Windows — `cmd.exe` mangles long messages (metacharacters)
   and caps length ~8k. Resolve the real
   `<npm root>/opencode-ai/bin/opencode.exe` (via `process.execPath`,
   never bare `npm` which is itself a shim) and spawn it directly.
3. No `--agent` routing for long prompts — subagent delegation drops message
   content; the primary answers directly. The prompt still forbids tools.
4. Watch `.next/dev/logs/next-development.log` — it carries `[llm]` and
   `[analyze]` diagnostics, including rejected payloads.
