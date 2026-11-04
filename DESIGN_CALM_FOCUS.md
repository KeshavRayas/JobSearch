# Calm Focus Design System — LOCKED (ui-calm-focus)

> **Future agents: this file wins.** Chosen by user via Lavish review on 2026-09-04
> (Concept C — Calm Focus, Slow & buttery 900ms). Inspired by awwwards.com/jobs.
> Do NOT reintroduce Neo-Brutalism (thick black borders, hard offset shadows,
> 150ms snaps, 3-column OS grid, yellow/green/purple command-center).

## Decision

- Direction: **C — Calm Focus**
- Motion: **Slow & buttery, 900ms**, easing `cubic-bezier(.16,1,.3,1)`
- Text: **minimal** — list shows title + company + 1 meta line only. Details on demand.
- Branch: `ui-calm-focus` | Worktree: `Job Search.worktrees/calm-focus`

## Tokens

```css
--paper: #fafaf7; /* page bg */
--ink: #111111; /* text */
--muted: rgba(17, 17, 17, 0.55);
--line: rgba(17, 17, 17, 0.08); /* hairline only, never 3px black */
--card: #ffffff;
--radius: 22px; /* cards */
--radius-pill: 999px;
--ease: cubic-bezier(0.16, 1, 0.3, 1);
--slow: 900ms;
--med: 600ms;
--fast: 350ms;
```

Forbidden: `border-3`, `border-4`, `brutal-shadow-*`, `bg-yellow`, `bg-green`,
`bg-purple` as chrome, `control-radio`, `control-checkbox` brutalist inputs.

## Type

- Display/serif: `Instrument Serif` (job titles, hero: "What do you want next?")
- UI: `Inter` (body, meta)
- Never uppercase labels everywhere. Sentence case, 13–15px meta in muted.

## Layout (C)

- Single centered column, `max-w-4xl`, airy `px-6 py-14`.
- Top: tiny uppercase eyebrow + count, centered serif hero, centered search pill.
- Filters: 3–4 pills only (All / Remote / Full-time / Senior). Advanced filters
  collapse into "More filters" disclosure — never a 280px sidebar.
- List: stacked calm cards, `fadeUp 900ms` staggered `animation-delay: i*60ms`.
- Focus mode: hovering a card dims siblings (`opacity:.35 + blur(.5px)` on wrapper).
- Detail: centered calm modal (`ModalShell`: `max-w-2xl`, `88vh`, hairline
  border, soft shadow `0 20px 50px -20px rgba(0,0,0,.18)`), backdrop click +
  Escape to close (filters preserved). NOT right-aligned sheet, NOT yellow
  header + 4px border.
- Pagination: minimal dots/pills, no brutalist circles.

## Motion (fast feedback, slow entrances)

- Entrances use `var(--ease)` at 900ms: cards `fadeUp` staggered,
  modal `calm-enter`. This is the only place 900ms lives.
- Hover/tap feedback is 250–300ms: cards lift, pills recolor, buttons
  respond. The old 900ms hover + sibling `blur()` made every interaction
  feel laggy and forced full-list repaints — both removed.
- No `backdrop-blur` on overlays (GPU-heavy over full pages); flat
  `bg-black/20` only. No `filter: blur()` on hover anywhere.
- Cards: `translateY(-4px)` + soft shadow on hover.
- List entrance: `fadeUp` staggered.
- Search filter: client-side, no full-page flash. Server list streams behind
  `<Suspense fallback={<CalmSkeleton/>}>` so hero stays interactive.
- `prefers-reduced-motion: reduce` disables all motion.
- Next.js: client navigations via `router.push('/?…')` must keep static shell
  (hero/search/pills) outside the Suspense boundary that wraps the job list.
  See `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`
  — Suspense placement matters; root fallback alone is not enough.

## Minimal-text rules

- Card: company (11px uppercase muted) + serif title (24px) + `location · salary`
  (13px muted) + max 3 skill pills. Nothing else.
- "Save →" text link, not buttons row. Counts only where needed.
- Empty state: one serif line + one muted line. No panels of instructions.

## Files that enforce this

- `src/app/globals.css` — tokens, calm-card, chip, fadeUp, skeleton, focus-dim
- `src/app/layout.tsx` — fonts (Inter + Instrument Serif), paper bg
- `src/app/page.tsx` — centered hero + Suspense-streamed list; homepage
  queries run in one parallel round (list + skill counts + search log);
  skill counts cached 10 min in-process; detail panel code-split
- `src/components/JobFilters.tsx` — search pill + 4 pills + More disclosure
- `src/components/JobCard.tsx` — calm card
- `src/components/JobDetailPanel.tsx` — calm sheet: hairline pills, tinted
  text badges (no filled green/yellow/red/purple), serif section titles,
  sentence-case footer; action buttons disabled until hydrated (logic untouched)
- `src/app/tracker/page.tsx` — calm board
- `src/app/resumes/page.tsx`, `resumes/new`, `resumes/[id]` — calm index +
  editor (ResumeForm/ResumeSectionEditor/ResumeUploadButton/
  DeleteResumeButton/LatexEditor chrome); section form used when no tex
  source exists
- `src/app/jobs/[id]/page.tsx` — calm standalone job view
- `src/components/Pagination.tsx`, `RefreshButton.tsx` — minimal pills
