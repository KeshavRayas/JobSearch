# Tsenta flow → local BYOK redesign

Source: “Tsenta Demo”, Agnay Srivastava, 67s (`youtu.be/VZyPsWQVgfA`),
reviewed 2026-11-04. The demo is mostly a silent screen recording.

**Status 2026-11-05:** the resume-only loop is implemented — queue → full-screen
workspace (fit + resume) → green/red changes → edit → approve → PDF →
“open application + I’ve applied.” Cover letters and interview prep were
removed; autofill is deferred.

## What Tsenta actually does

```text
Dashboard
  ├─ AI Matching / Keyword Search / Query
  ├─ filters: date, job type, workplace, location
  ├─ job cards: source, match %, skill chips, View Details / Apply
  └─ “Add Your Own Link”: paste any job URL → Quick Apply
        │
        ▼
Optimize (stepper: Optimize → Review → Submit → Done)
  ├─ match score + required skills + matched/missing keywords
  ├─ editable resume document (click any field to edit)
  ├─ font family / size
  ├─ drag section order
  └─ Approve Resume / Default Resume / Cancel
        │
        ▼
Ready for Review
  ├─ embedded browser opens the company application (e.g. Ashby)
  ├─ form is filled from the profile / resume
  ├─ user answers policy questions, reviews, submits
  └─ “I’ve Applied” or Skip
        │
        ▼
Tracker
  ├─ Applied / Ghosted / Interviewing / Rejected / Offer
  ├─ drag-and-drop board + activity view
  └─ pipeline flow graph
```

Left sidebar is a work queue: **Running**, **Action Required**, **Waiting for
Approval**, **Optimizing Resume**.

Screens observed: dashboard at 8s, editable review at 30s, embedded apply form
at 42s, tracker at 54s.

## Why our tailoring keeps failing

Current design treats the model output as immutable and proves provenance
per item:

- `UNCHANGED` / `REORDER` must reproduce text exactly.
- Unknown evidence IDs, changed contact blocks, cleaned skill text, or a merged
  skill blob throw `TEXT_MISMATCH` and persist nothing.
- The user gets a validation error instead of a draft they can fix.

Tsenta inverts this: the model produces a **draft**, the user edits it, and
approval is explicit. Grounding is a prompt constraint + visible match report,
not a hard gate that blocks the workflow.

## Target: local Tsenta-style tailoring

Keep: ingestion, ranking, job detail, BYOK/model selection, PDF render, tracker.
Replace: provenance-gated tailoring.

### 1. Draft, not verdict

`POST /api/jobs/:id/tailor` returns an editable `ResumeDraft`:

```ts
{
  id, jobId, version,
  sections: [...],          // same structured resume shape
  match: {
    score, matchedKeywords, missingKeywords,
    requiredSkills, matchedSkills, missingSkills
  },
  status: "DRAFT" | "APPROVED",
  warnings: string[]        // soft checks, never block
}
```

Prompt rules remain: no new employers, dates, degrees, metrics, or technologies.
But a model mistake produces a **warning**, not a 502. The user can fix it in
the editor.

### 2. Inline editor

In the job panel (or a dedicated `/jobs/:id/tailor` page):

- every text field is editable in place;
- bullet add/remove;
- section reorder;
- font family/size for the PDF;
- Save / Approve / Reset to default.

`PUT /api/jobs/:id/tailor` persists edits. `POST /approve` locks the version and
allows PDF render. Auto-save drafts.

### 3. Review and submit

- Show match score + matched/missing keywords next to the draft.
- “Approve Resume” → PDF + ATS.
- “Open application” opens the company URL and records `OPENED`.
- Optional later: local Playwright autofill of the company form (Tsenta embeds
  a browser and fills it); start with opening the real page.

### 4. Tracker stages

Move from `QUEUED/OPENED/SAVED/SKIPPED` to Tsenta-like stages:

```text
APPLIED → GHOSTED → INTERVIEWING → REJECTED → OFFER
```

Keep `SAVED` as a pre-apply bookmark. Drag-and-drop board; activity view.

### 5. Data changes

- `TailoredResume`: add `status`, `editedAt`, `approvedAt`, `match` JSON,
  `warnings String[]`; keep `content` editable; drop hard validation status
  from the critical path.
- Keep versions for history; only `isCurrent + APPROVED` can render.
- `ApplicationDecision`: extend status enum with `GHOSTED`, `INTERVIEWING`,
  `REJECTED`, `OFFER`.

## Suggested build order

1. Editable draft + match report + save/approve (removes the `contact_main`
   class of failures).
2. Inline editor UI + section reorder + font controls.
3. Apply flow: open URL, mark applied, tracker stages.
4. Optional browser autofill with local Playwright profiles.

## Decisions

1. Cover-letter flow: removed, to match Tsenta’s resume-only demo.
2. Apply: starts with opening the company page + “I’ve applied.” No autofill in
   this pass.
3. Resume validation: editable draft with visible warnings; approval gates PDF.
