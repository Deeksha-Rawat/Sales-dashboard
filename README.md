# Sales Pipeline

A single-screen CRM for a sales team sharing one pipeline of ~50,000 deals — table and board
views over the same data, built to stay smooth at that scale, survive a flaky network, and
stay correct when several people edit the same deal at once.

## Problem statement

A sales team of 20 people shares one pipeline with about 50,000 deals, moving through
**New Lead → Contacted → Demo Done → Proposal Sent → Negotiation → Won / Lost**. Everyone
works on it at the same time, and the team's complaints were:

- "I don't know which deals to work on today."
- "I moved a deal, but it didn't save, and nobody told me."
- "Deals keep jumping around because teammates are editing at the same time."
- "At quarter end I need to move thousands of old deals to Lost, and I can only do it a few
  at a time."
- "I can't use a mouse for long."

The brief: design and build a screen that helps this team manage the pipeline. It should
stay smooth with 50,000 deals, let users move one deal or many at once, handle a slow and
unreliable network (saves take 0.3–1.5s, ~1 in 10 fail), stay up to date as teammates change
deals without disturbing the user, and work with the keyboard — with no real backend, so the
app simulates one internally with adjustable delays, failures, and conflicts.

## Running it

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. You'll land on a mock login screen — there's no real backend
or auth provider, so a handful of demo accounts are listed right on the screen (click one to
sign in instantly, or type the credentials in yourself):

| Name | Email | Password |
|---|---|---|
| Priya Patel | `priya@salesco.com` | `demo1234` |
| Alex Chen | `alex@salesco.com` | `demo1234` |
| Dana Kim | `dana@salesco.com` | `demo1234` |
| Sofia Rossi | `sofia@salesco.com` | `demo1234` |

The "API" itself is a set of Next.js route handlers backed by an in-memory store, seeded
with 50,000 generated deals on first request (see `src/lib/deals/server-store.ts`). Data and
your login both reset whenever the dev server restarts (login persists across page reloads
via `localStorage` in the meantime).

```bash
npm test       # vitest, runs the store/business-logic suite once
npm run build  # production build + typecheck
npm run lint   # eslint
```

## What's here

**Views**
- **Table** (`deals-table.tsx`) — the default. Dense, sortable, virtualized
  (`@tanstack/react-virtual` + `@tanstack/react-table`), full-width proportional columns,
  inline-editable cells, row checkboxes with shift-click range select, and a dedicated
  Actions column (edit, plus a menu for view/archive/delete).
- **Board** (`deals-board.tsx`) — Trello-style columns by stage, each independently
  virtualized and infinitely scrollable. Cards show owner, company, priority, value, and the
  same quick-action menu as the table; stage changes go through a keyboard-operable select
  rather than drag-and-drop.
- Both share one virtualized-row primitive and one save pipeline — a card and a table row
  calling `updateDeal` are indistinguishable from the store's point of view.

**Finding what to work on**
- Debounced search across deal name, company, and owner.
- A **Filters** panel (Stage, Priority, Owner, and an Archived toggle) that renders active
  filters as removable tag chips instead of a permanently-visible wall of controls.
- Sortable columns, and a shared "N deals" count that reflects the live filtered total.

**Editing a deal**
- Inline edits for stage, priority, value, and owner directly in the table/board — optimistic,
  with per-row save/retry status.
- A side drawer (click a deal name, or the pencil icon) with the full record and an editable
  **Remarks** field (explicit Add/Update button, not silent autosave).
- **Archive** (hides a deal from the live pipeline without deleting it; a filter toggle shows
  the archive) and **Delete** (permanent, gated behind a confirmation dialog) from the row's
  action menu in both views.

**Bulk operations**
- Select one deal, a shift-click range, every loaded row, or — via the "Select all N matching
  filters" action — every row matching the current filter across all 50,000, not just what's
  scrolled into view.
- The bulk action bar moves the whole selection to a stage in chunks of 50, with a progress
  bar; a failed chunk doesn't block the rest, and failed ids can be retried as a group.

**Staying in sync**
- A background poll merges in whatever teammates changed, without moving rows you're not
  touching, disturbing your scroll position, or clobbering an edit in flight.
- A conflict dialog appears when your edit collides with someone else's, highlighting exactly
  which fields differ between "your version" and "theirs" so nothing is silently overwritten.

**Everything else**
- Keyboard-operable custom dropdowns (arrow keys, type-ahead, Escape) built from scratch so
  they never clip inside the virtualized/scrolling containers.
- Shimmer loading skeletons (table, board, and the detail drawer) instead of bare spinners.
- A **simulation panel** (bottom-right gear icon) with live sliders for save latency, failure
  rate, conflict rate, and background "teammate activity" rate, so reviewers can dial failure
  modes up or down without touching code.

## Why table-first, not board-first

The brief is explicit that some stages hold 10,000 deals. A board column with 10,000 cards is
still usable once virtualized, but it's a bad surface for the actual job — "which deals do I
work on today" is a filter/sort/scan problem, and a table lets you sort by value, close date,
or last-updated, scan many rows at once, and edit a cell without opening anything. The board
earns its keep for the second job, "where does this deal sit relative to its neighbors," which
is more of a glance mental model. So both exist, table is the default.

I rejected a single board-only design (doesn't scale to "I don't know which deals to work on
today" without heavy filtering first) and a table-only design (loses the "where do things sit
in the funnel" glanceability that's the whole point of a pipeline).

## Save logic and concurrent updates

Every edit (cell, bulk move, undo, archive) goes through one optimistic-update path in
`src/store/deals-store.ts`:

1. The change applies to local state immediately — no spinner before you see your edit.
2. The row shows a "saving" indicator.
3. On success, the server's record (with a bumped `version`) replaces the local one. If the
   edit moved the deal out of (or into) the active filtered view — most notably archiving —
   the row is added to or removed from the visible list to match.
4. On failure, the row **reverts** to its pre-edit value and shows a retry affordance — a
   toast with a "Retry" action, plus a persistent retry icon on the row itself. Nothing is
   left in a silently-wrong state.
5. On a **version conflict** (someone else's write landed first), nothing is auto-merged. A
   dialog shows "your version" vs "their version" side by side, with the fields that actually
   differ highlighted, and asks which to keep. This is why every deal carries a `version`
   field and every PATCH sends the version it was based on (`applyUpdate` in
   `server-store.ts` rejects a stale version with a 409).
6. **Undo** replays the inverse change through the exact same pipeline — so an undo can
   itself fail or conflict, and is handled identically rather than being a special case.

Bulk operations chunk the selected ids (50 per request) and apply each chunk sequentially,
updating a progress bar as they go; a failed chunk doesn't block the rest, and failed ids can
be retried as a group afterward. Delete is the one irreversible action, so it's the only one
gated behind a confirmation dialog rather than undo.

The fake API (`src/lib/deals/simulate.ts`) adds 150–500ms latency and a 10% failure rate by
default to every write, and a 10% chance of injecting a version conflict — all adjustable
live from the simulation panel.

## Staying up to date without disturbing the user

This was the one requirement that needed more than "handle it when the user acts" — the
brief asks for the UI to reflect teammates' changes on its own. There's no websocket/SSE
here (no real backend), so it's simulated with:

- `maybeSimulateTeammateActivity` (`server-store.ts`) — on every list/changes request, with
  some probability (configurable, default 40%), a few random deals get mutated server-side
  as if another rep touched them — stage advances, value/priority shifts, or an owner
  reassignment.
- `GET /api/deals/changes?since=<timestamp>` — a cheap diff endpoint that returns only deals
  touched since the client's last sync, instead of re-fetching the full (possibly 50k-row)
  list.
- The client polls this every 4 seconds (`backgroundSync` in `deals-store.ts`, paused when
  the tab isn't visible) and merges results in place: rows still matching the current filters
  update quietly and get a brief highlight flash; rows that no longer match disappear from
  the view; **rows with a save in flight are skipped entirely** so a background sync can
  never clobber an edit you're in the middle of. Existing row order, scroll position, and
  selection are all left untouched — nothing jumps or resets.

## Performance at 50k rows

- **Pagination**: `/api/deals` serves 200 rows per page; the client only ever holds what
  it's scrolled through (`loadMoreDeals`), not the full matching set. "Select all matching
  filters" uses a separate id-only endpoint so bulk selection across all 50k stays cheap
  without pulling full row data.
- **Virtualization**: both views render only the rows/cards in (and just around) the
  viewport, with heights measured dynamically rather than estimated, so there's no stale gap
  or overlap as content loads in.
- **Memoization**: the table's columns, derived row array, and virtualizer callbacks are all
  stabilized — an earlier version recreated them on every render, which fed unstable
  references into `@tanstack/react-table`/`react-virtual` and caused a measurable render
  storm (confirmed with a real browser: thousands of DOM mutations per second on an
  otherwise idle page).

## Testing

`src/store/__tests__/` and `src/components/**/__tests__/` cover the business logic that
actually matters here: optimistic apply/revert, retry, conflict surfacing and both
resolutions, undo through the save pipeline, archive/unarchive and the view-membership logic
it depends on, delete with optimistic rollback on failure, bulk partial-failure and
retry-only-failed, pagination (replace vs. append), and the background-sync merge rules
(quiet merge, skip-if-pending, drop-if-filtered-out, no-op on a failed poll) — plus real
render tests for the virtualized table (row count stays flat as the dataset scales from 5k
to 50k) and the custom dropdown (keyboard/click interaction, open/commit/close).

## What I'd do with more time

- A proper "create deal" flow — out of scope for this brief, which is why the board
  columns' header has no "+" button even though the reference design I was asked to match
  included one.
- Column-level keyboard navigation in the table (arrow keys between cells, like a
  spreadsheet) — today keyboard access works via tab order and native controls, which is
  correct but not fast for someone who can't use a mouse for long.
- Replace the simulated teammate-activity polling with real backend push semantics
  (SSE/websocket) if this ever sits in front of a real API, and widen the diff endpoint to
  accept the active filters server-side so idle clients with a narrow view don't pay for
  polling a wide "all changes" response.
- Persist simulation config, filters, and the active view (table/board) to the URL so a
  reviewer's state survives a refresh.
- Real auth instead of the mock login, and scope deals/ownership to the signed-in user by
  default.
