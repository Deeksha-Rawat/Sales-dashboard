# Sales Pipeline

A single-screen deal pipeline for a 20-person sales team sharing ~50,000 deals: table and
board views over the same data, built to stay smooth at that scale, survive a flaky network,
and stay correct when several people edit the same deal at once.

## Running it

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. There's no login and no real backend — the "API" is a set of
Next.js route handlers backed by an in-memory store, seeded with 50,000 generated deals on
first request (see `src/lib/deals/server-store.ts`). Data resets whenever the dev server
restarts.

```bash
npm test       # vitest, runs the store/business-logic suite once
npm run build  # production build + typecheck
npm run lint   # eslint
```

## What's here

- **Table view** (`deals-table.tsx`) — the default. Dense, sortable, virtualized
  (`@tanstack/react-virtual` + `@tanstack/react-table`), inline-editable cells, row
  checkboxes with shift-click range select.
- **Board view** (`deals-board.tsx`) — Trello-style columns by stage, also virtualized per
  column. Cards move stage via a keyboard-operable `<select>` rather than drag-and-drop.
- **Toolbar** — search (debounced), stage/priority filters, owner filter, view toggle.
- **Bulk action bar** — appears once rows are selected; moves them to a stage in chunks,
  with a progress bar and per-row success/failure after the fact.
- **Simulation panel** (bottom-right gear icon) — live sliders for save latency, failure
  rate, conflict rate, and background "teammate activity" rate, so reviewers can dial
  failure modes up or down without touching code.

## Why table-first, not board-first

The problem statement is explicit that some stages hold 10,000 deals. A board column with
10,000 cards is still usable once virtualized, but it's a bad surface for the actual job —
"which deals do I work on today" is a filter/sort/scan problem, and a table lets you sort by
value, close date, or last-updated, scan many rows at once, and edit a cell without opening
anything. The board earns its keep for the second job, "where does this deal sit relative to
its neighbors," which is more of a glance-and-drag mental model. So both exist, table is the
default, and they share the same virtualized-row primitive and the same save pipeline — a
card and a table row calling `updateDeal` are indistinguishable from the store's point of
view.

I rejected a single board-only design (doesn't scale to "I don't know which deals to work on
today" without heavy filtering first) and a table-only design (loses the "where do things
sit in the funnel" glanceability that's the whole point of a pipeline).

## Save logic and concurrent updates

Every edit (cell, bulk move, undo) goes through one optimistic-update path in
`src/store/deals-store.ts`:

1. The change applies to local state immediately — no spinner before you see your edit.
2. The row shows a "saving" indicator (`row-status.tsx`).
3. On success, the server's record (with a bumped `version`) replaces the local one.
4. On failure, the row **reverts** to its pre-edit value and shows a retry affordance — a
   toast with a "Retry" action, plus a persistent retry icon on the row itself. Nothing is
   left in a silently-wrong state.
5. On a **version conflict** (someone else's write landed first), nothing is auto-merged.
   A dialog shows "your version" vs "their version" side by side and asks to keep one —
   "keep mine" resends the edit on top of the latest server version; "keep theirs" discards
   the local change. This is why every deal carries a `version` field and every PATCH sends
   the version it was based on (`applyUpdate` in `server-store.ts` rejects a stale version
   with a 409).
6. **Undo** replays the inverse change through the exact same pipeline — so an undo can
   itself fail or conflict, and is handled identically rather than being a special case.

Bulk operations chunk the selected ids (50 per request) and apply each chunk sequentially,
updating a progress bar as they go; a failed chunk doesn't block the rest, and failed ids can
be retried as a group afterward. This matches "I can only do it a few at a time" from the
brief, but automated and non-blocking instead of manual.

The fake API (`src/lib/deals/simulate.ts`) adds 150–500ms latency and a 10% failure rate by
default to every write, and a 10% chance of injecting a version conflict — all adjustable
live from the simulation panel.

## Staying up to date without disturbing the user

This was the one requirement that needed more than "handle it when the user acts" — the
brief asks for the UI to reflect teammates' changes on its own. There's no websocket/SSE
here (no real backend), so it's simulated with:

- `maybeSimulateTeammateActivity` (`server-store.ts`) — on every list/changes request, with
  some probability (configurable, default 40%), a few random deals get mutated server-side
  as if another rep touched them — stage advances, value or priority shifts.
- `GET /api/deals/changes?since=<timestamp>` — a cheap diff endpoint that returns only deals
  touched since the client's last sync, instead of re-fetching the full (possibly 50k-row)
  list.
- The client polls this every 4 seconds (`backgroundSync` in `deals-store.ts`) and merges
  results in place: rows still matching the current filters update quietly and get a brief
  highlight flash; rows that no longer match disappear from the view; **rows with a save in
  flight are skipped entirely** so a background sync can never clobber an edit you're in the
  middle of. Existing row order, scroll position, and selection are all left untouched —
  nothing jumps or resets.

## Testing

`src/store/__tests__/` covers the business logic that actually matters here: optimistic
apply/revert, retry, conflict surfacing and both resolutions, undo through the save
pipeline, bulk partial-failure and retry-only-failed, and the background-sync merge rules
(quiet merge, skip-if-pending, drop-if-filtered-out, no-op on a failed poll). 18 tests, all
in `src/store` since that's where the logic that was actually hard to get right lives —
components are mostly thin render layers over it.

## What I'd do with more time

- Range-based pagination/cursor on the list endpoint instead of returning the full filtered
  set — fine up to 50k rows in-memory, but not how I'd ship this against a real database.
- A proper "select all N matching the current filter" action distinct from "select all
  loaded" (today they're the same because the list endpoint returns everything that
  matches, but that coupling is accidental).
- Column-level keyboard navigation in the table (arrow keys between cells, like a
  spreadsheet) — today keyboard access works via tab order and native controls, which is
  correct but not fast for someone who can't use a mouse for long.
- Replace the simulated teammate-activity polling with real backend push semantics
  (SSE/websocket) if this ever sits in front of a real API, and widen the diff endpoint to
  accept the active filters server-side so idle clients with a narrow view don't pay for
  polling a wide "all changes" response.
- Persist simulation config and filters to the URL so a reviewer's state survives a refresh.
