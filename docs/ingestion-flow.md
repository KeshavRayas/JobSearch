# Ingestion Flow

## Trigger

Vercel Cron Job runs every 6 hours: `GET /api/cron/ingest`

Set `CRON_SECRET` on the project and Vercel sends it as
`Authorization: Bearer …` automatically; the route 401s anything else.
Unset locally = open (dev frictionless). `maxDuration = 300` on the route.

Each source fetch retries in-run (3 attempts, 5s/15s backoff, 2min cap
via `src/lib/jobs/retry.ts`) — transient tenant outages self-heal instead
of waiting for the next run. Per-source isolation (`allSettled`) means one
dead feed never sinks the others.

## Pipeline Steps

```
1. Create SourceSync record (success=false)
2. For each JobSource implementation:
   a. Call fetchJobs()
   b. Validate each RawJob with Zod
   c. Write JobIngestionLog with raw JSON payload
   d. Extract & normalize skills via SKILL_ALIASES
   e. Upsert job to database
      ON CONFLICT (externalId, source) DO UPDATE
      SET title, description, ... , searchVector = to_tsvector(...)
   f. Update SourceSync counters
3. Mark SourceSync success=true
4. Invalidate Redis cache keys
```

## Idempotency

Running the cron multiple times is safe:

- `@@unique([externalId, source])` prevents duplicate jobs
- Prisma `upsert` updates existing records instead of creating duplicates

## Source Adapters

Each adapter implements:

```typescript
interface JobSource {
  readonly name: string;
  fetchJobs(): Promise<RawJob[]>;
}
```

| Source     | Method                    | Notes                                                                                                             |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Adzuna     | REST API                  | Free tier, India/Bangalore focused                                                                                |
| Jooble     | REST API                  | Free tier, global + India                                                                                         |
| Remotive   | JSON feed                 | No auth needed, remote jobs                                                                                       |
| Greenhouse | Board JSON                | Scrapes company-specific board URLs                                                                               |
| Lever      | Public API                | Scrapes company-specific postings                                                                                 |
| Ashby      | Posting API               | Scrapes company-specific postings                                                                                 |
| Workday    | CxS JSON (POST, limit 20) | Per-tenant boards; `atsBoard` = `<host>/<board>`. List + per-job detail fetch. Seeded: Nvidia, Walmart, Accenture |

## Debugging

- Check `SourceSync` for per-source success/failure
- Check `JobIngestionLog` for raw payloads when sources change their response shape
