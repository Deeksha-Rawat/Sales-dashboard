import { create } from "zustand";
import { toast } from "sonner";
import {
  ApiError,
  ConflictApiError,
  createDeal as createDealApi,
  deleteDeal as deleteDealApi,
  fetchDealChanges,
  fetchDealIds,
  fetchDeals,
  patchDeal,
} from "@/lib/deals/api-client";
import { EMPTY_FILTERS, Filters, matchesFilters } from "@/lib/deals/filters";
import {
  Deal,
  DealMutableFields,
  DealSummary,
  ListDealsParams,
} from "@/lib/deals/types";

export type { Filters } from "@/lib/deals/filters";

const PAGE_SIZE = 200;

/** Module-level (not store state) so it never triggers a render and survives StrictMode's double-invoke. */
let backgroundSyncInFlight = false;

export type SortField = keyof DealSummary;
export interface SortState {
  field: SortField;
  dir: "asc" | "desc";
}

export type RowStatus = "idle" | "saving" | "failed" | "conflict";

export interface PendingEdit {
  status: RowStatus;
  previous: Partial<DealMutableFields>;
  changes: Partial<DealMutableFields>;
  error?: string;
  conflictCurrent?: Deal;
}

export interface UndoEntry {
  id: string;
  label: string;
  inverseChanges: Partial<DealMutableFields>;
}

interface DealsState {
  deals: Record<string, DealSummary>;
  order: string[];
  total: number;
  owners: string[];
  loading: boolean;
  loadError: string | null;

  /** Pagination over the current filtered+sorted view — `order` only ever holds what's been loaded so far. */
  nextCursor: number | null;
  hasMore: boolean;
  loadingMore: boolean;

  filters: Filters;
  sort: SortState;

  selected: Set<string>;

  pending: Record<string, PendingEdit>;
  undoStack: UndoEntry[];
  lastUndoToastId: string | null;

  lastSyncAt: string | null;
  recentlyUpdated: Set<string>;
  /** True while ANY sync (the 5s auto-poll or a manual Refresh click) is in flight — used for
   *  background bookkeeping, not UI, since the auto-poll firing shouldn't make the Refresh
   *  button look busy. See `manualSyncing` for that. */
  syncing: boolean;
  /** True only while a sync the user explicitly triggered by clicking Refresh is in flight —
   *  this is what the toolbar button's spinner/disabled state reflects, so the button doesn't
   *  appear to "always be refreshing" just because the 5s auto-poll is also running. */
  manualSyncing: boolean;
  /** Timestamp of the most recent successful sync, automatic or manual — purely informational
   *  (the toolbar's "last refreshed Xs ago" subtitle), separate from `lastSyncAt` (the cursor
   *  used for the changes-since query). */
  lastRefreshedAt: string | null;

  loadDeals: () => Promise<void>;
  loadMoreDeals: () => Promise<void>;
  /** Pulls in whatever changed since the last sync. `manual: true` is for the toolbar's
   *  Refresh button — the 5s auto-poll in page.tsx calls this with no argument. The only
   *  difference is which busy flag it toggles; the actual sync logic is identical either way,
   *  so the button is a pure "don't wait for the next tick" fallback, not a separate code path. */
  backgroundSync: (opts?: { manual?: boolean }) => Promise<void>;
  setFilters: (filters: Partial<Filters>) => void;
  setSort: (sort: SortState) => void;

  toggleSelect: (id: string) => void;
  selectIds: (ids: string[]) => void;
  clearSelection: () => void;
  selectAllVisible: () => void;
  selectAllMatching: () => Promise<void>;

  updateDeal: (
    id: string,
    changes: Partial<DealMutableFields>,
    opts?: { undoLabel?: string }
  ) => Promise<void>;
  retry: (id: string) => Promise<void>;
  resolveConflict: (id: string, resolution: "mine" | "theirs") => Promise<void>;
  dismissPending: (id: string) => void;
  undo: () => Promise<void>;
  deleteDeal: (id: string) => Promise<void>;
  addDeal: (fields: DealMutableFields) => Promise<void>;

  applyServerRecord: (summary: DealSummary) => void;
}

function toParams(filters: Filters, sort: SortState, cursor = 0): ListDealsParams {
  return {
    search: filters.search || undefined,
    stage: filters.stage.length ? filters.stage : undefined,
    owner: filters.owner.length ? filters.owner : undefined,
    priority: filters.priority.length ? filters.priority : undefined,
    minValue: filters.minValue,
    maxValue: filters.maxValue,
    archived: filters.archived,
    sortBy: sort.field,
    sortDir: sort.dir,
    cursor,
    limit: PAGE_SIZE,
  };
}

export const useDealsStore = create<DealsState>((set, get) => ({
  deals: {},
  order: [],
  total: 0,
  owners: [],
  // Starts true: the client hasn't fetched anything yet on first mount, and showing "no deals
  // match" before the first load even runs would look like the table is broken, not loading.
  loading: true,
  loadError: null,

  nextCursor: null,
  hasMore: false,
  loadingMore: false,

  filters: { ...EMPTY_FILTERS },
  sort: { field: "updatedAt", dir: "desc" },

  selected: new Set(),

  pending: {},
  undoStack: [],
  lastUndoToastId: null,

  lastSyncAt: null,
  recentlyUpdated: new Set(),
  syncing: false,
  manualSyncing: false,
  lastRefreshedAt: null,

  /** Replaces the current view — called on initial mount and whenever filters/sort change. */
  loadDeals: async () => {
    set({ loading: true, loadError: null });
    try {
      const { filters, sort } = get();
      const res = await fetchDeals(toParams(filters, sort, 0));
      const deals: Record<string, DealSummary> = {};
      const order: string[] = [];
      for (const row of res.rows) {
        deals[row.id] = row;
        order.push(row.id);
      }
      set({
        deals,
        order,
        total: res.total,
        owners: res.owners,
        loading: false,
        lastSyncAt: res.serverTime,
        nextCursor: res.nextCursor,
        hasMore: res.hasMore,
      });
    } catch (err) {
      set({
        loading: false,
        loadError: err instanceof Error ? err.message : "failed to load deals",
      });
    }
  },

  /**
   * Appends the next page — called when the table/board scrolls near the end of what's
   * loaded. This (plus the server only ever serializing one page) is what keeps both the
   * network payload and the client's `deals`/`order` state small regardless of how many of
   * the 50k rows match the current filter; without it every edit's optimistic update would
   * be copying a 50,000-entry object.
   */
  loadMoreDeals: async () => {
    const { hasMore, loadingMore, nextCursor, filters, sort } = get();
    if (!hasMore || loadingMore || nextCursor === null) return;
    set({ loadingMore: true });
    try {
      const res = await fetchDeals(toParams(filters, sort, nextCursor));
      set((s) => {
        const deals = { ...s.deals };
        const order = [...s.order];
        for (const row of res.rows) {
          if (!(row.id in deals)) order.push(row.id);
          deals[row.id] = row;
        }
        return {
          deals,
          order,
          total: res.total,
          loadingMore: false,
          nextCursor: res.nextCursor,
          hasMore: res.hasMore,
        };
      });
    } catch {
      set({ loadingMore: false });
      toast.error("Couldn't load more deals — scroll to retry");
    }
  },

  /**
   * Polled in the background (see page.tsx) to pull in whatever other "teammates" changed
   * since the last sync, without disturbing the current scroll position, selection, or any
   * row mid-edit. Only ever touches rows that aren't currently pending a local save.
   */
  backgroundSync: async (opts) => {
    const manual = !!opts?.manual;
    const { lastSyncAt } = get();
    if (!lastSyncAt || backgroundSyncInFlight) return;
    backgroundSyncInFlight = true;
    set(manual ? { syncing: true, manualSyncing: true } : { syncing: true });

    try {
      const res = await fetchDealChanges(lastSyncAt);
      if (!res.changed.length) {
        set({ lastSyncAt: res.serverTime, lastRefreshedAt: res.serverTime });
        return;
      }

      const touchedIds: string[] = [];
      set((s) => {
        const nextDeals = { ...s.deals };
        const nextOrder = [...s.order];

        for (const row of res.changed) {
          if (s.pending[row.id]) continue;
          const idx = nextOrder.indexOf(row.id);
          const stillMatches = matchesFilters(row, s.filters);

          if (stillMatches) {
            // Update rows already in view IN PLACE — never reposition them. The brief
            // explicitly calls out "deals keep jumping around because teammates are editing
            // at the same time" as a problem to solve, not reproduce: moving a row (e.g. to
            // the front, to match an "updated desc" sort) out from under someone mid-click
            // is exactly that bug. A brand-new match is appended to the end instead, where
            // it can't disturb what's already on screen.
            nextDeals[row.id] = row;
            if (idx === -1) nextOrder.push(row.id);
            touchedIds.push(row.id);
          } else if (idx !== -1) {
            nextOrder.splice(idx, 1);
            delete nextDeals[row.id];
          }
        }

        const nextRecentlyUpdated = new Set(s.recentlyUpdated);
        for (const id of touchedIds) nextRecentlyUpdated.add(id);

        // `total` is intentionally left alone here: with pagination, `order` only reflects
        // what's been loaded so far, not every row matching the filter, so there's no way to
        // tell from a diff alone whether a newly-matching/no-longer-matching row should move
        // the true total. It goes slightly stale between full reloads, which is a much safer
        // failure mode than silently collapsing the toolbar's "50,000 deals" down to "38".
        return {
          deals: nextDeals,
          order: nextOrder,
          lastSyncAt: res.serverTime,
          lastRefreshedAt: res.serverTime,
          recentlyUpdated: nextRecentlyUpdated,
        };
      });

      if (touchedIds.length) {
        setTimeout(() => {
          set((s) => {
            const next = new Set(s.recentlyUpdated);
            for (const id of touchedIds) next.delete(id);
            return { recentlyUpdated: next };
          });
        }, 2000);
      }
    } catch {
      // Background sync failing silently is the point — don't interrupt the user with it.
      // The next tick will simply try again from the same `lastSyncAt`.
    } finally {
      backgroundSyncInFlight = false;
      set(manual ? { syncing: false, manualSyncing: false } : { syncing: false });
    }
  },

  setFilters: (partial) => {
    set((s) => ({ filters: { ...s.filters, ...partial } }));
    void get().loadDeals();
  },

  setSort: (sort) => {
    set({ sort });
    void get().loadDeals();
  },

  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),

  selectIds: (ids) => set((s) => ({ selected: new Set([...s.selected, ...ids]) })),

  clearSelection: () => set({ selected: new Set() }),

  /** Selects every row currently loaded into `order` — not necessarily every row matching the filter once paginated. */
  selectAllVisible: () => set((s) => ({ selected: new Set(s.order) })),

  /**
   * Selects every id matching the current filter, loaded or not — the "move thousands of
   * deals to Lost" case from the brief, which `selectAllVisible` alone can no longer cover
   * once the list is paginated. Uses the id-only endpoint so this stays cheap even across
   * all 50k rows.
   */
  selectAllMatching: async () => {
    const { filters } = get();
    try {
      const res = await fetchDealIds({
        search: filters.search || undefined,
        stage: filters.stage.length ? filters.stage : undefined,
        owner: filters.owner.length ? filters.owner : undefined,
        priority: filters.priority.length ? filters.priority : undefined,
        minValue: filters.minValue,
        maxValue: filters.maxValue,
        archived: filters.archived,
      });
      set({ selected: new Set(res.ids) });
    } catch {
      toast.error("Couldn't select all matching deals");
    }
  },

  applyServerRecord: (summary) =>
    set((s) => ({ deals: { ...s.deals, [summary.id]: summary } })),

  updateDeal: async (id, changes, opts) => {
    const current = get().deals[id];
    if (!current) return;

    const previous: Partial<DealMutableFields> = {};
    for (const key of Object.keys(changes) as (keyof DealMutableFields)[]) {
      (previous as Record<string, unknown>)[key] = (current as unknown as Record<string, unknown>)[key];
    }

    set((s) => ({
      deals: { ...s.deals, [id]: { ...current, ...changes } },
      pending: {
        ...s.pending,
        [id]: { status: "saving", previous, changes },
      },
    }));

    if (opts?.undoLabel) {
      set((s) => ({
        undoStack: [...s.undoStack, { id, label: opts.undoLabel!, inverseChanges: previous }],
      }));
      toast.success(`Updated ${opts.undoLabel}`, {
        action: { label: "Undo", onClick: () => get().undo() },
      });
    }

    await performSave(set, get, id, current.version, changes);
  },

  retry: async (id) => {
    const pending = get().pending[id];
    const current = get().deals[id];
    if (!pending || !current) return;
    set((s) => ({ pending: { ...s.pending, [id]: { ...pending, status: "saving", error: undefined } } }));
    await performSave(set, get, id, current.version, pending.changes);
  },

  resolveConflict: async (id, resolution) => {
    const pending = get().pending[id];
    if (!pending || !pending.conflictCurrent) return;
    const serverRecord = pending.conflictCurrent;

    if (resolution === "theirs") {
      set((s) => {
        const { [id]: _removed, ...rest } = s.pending;
        return {
          deals: { ...s.deals, [id]: serverRecord },
          pending: rest,
        };
      });
      return;
    }

    // "mine": re-apply local changes on top of the latest known server version.
    set((s) => ({
      deals: { ...s.deals, [id]: { ...serverRecord, ...pending.changes } },
      pending: { ...s.pending, [id]: { ...pending, status: "saving", error: undefined } },
    }));
    await performSave(set, get, id, serverRecord.version, pending.changes);
  },

  dismissPending: (id) =>
    set((s) => {
      const { [id]: _removed, ...rest } = s.pending;
      return { pending: rest };
    }),

  undo: async () => {
    const stack = get().undoStack;
    if (!stack.length) return;
    const entry = stack[stack.length - 1];
    set({ undoStack: stack.slice(0, -1) });
    await get().updateDeal(entry.id, entry.inverseChanges);
  },

  /**
   * Permanently removes a deal — unlike archive (an `updateDeal({ archived: true })` call,
   * reversible through the normal undo stack), this actually deletes the server record, so
   * there's no undo: the UI only offers it from behind a confirmation step.
   */
  deleteDeal: async (id) => {
    const current = get().deals[id];
    if (!current) return;
    const prevOrder = get().order;
    const prevTotal = get().total;

    set((s) => {
      const { [id]: _removed, ...deals } = s.deals;
      const selected = new Set(s.selected);
      selected.delete(id);
      return {
        deals,
        order: s.order.filter((x) => x !== id),
        total: Math.max(0, s.total - 1),
        selected,
      };
    });

    try {
      await deleteDealApi(id);
      toast.success("Deal deleted");
    } catch {
      set((s) => ({
        deals: { ...s.deals, [id]: current },
        order: prevOrder,
        total: prevTotal,
      }));
      toast.error("Couldn't delete the deal — restored");
    }
  },

  // Unlike an edit, there's no local id to apply optimistically until the server assigns
  // one — the modal shows its own saving state and stays open on failure so nothing typed
  // is lost. On success the new deal is dropped into the current view only if it actually
  // matches the active filters, same rule background sync uses for newly-matching rows.
  addDeal: async (fields) => {
    const created = await createDealApi(fields);
    set((s) => {
      if (!matchesFilters(created, s.filters)) return {};
      const nextRecentlyUpdated = new Set(s.recentlyUpdated);
      nextRecentlyUpdated.add(created.id);
      return {
        deals: { ...s.deals, [created.id]: created },
        order: [created.id, ...s.order],
        total: s.total + 1,
        recentlyUpdated: nextRecentlyUpdated,
      };
    });
    setTimeout(() => {
      set((s) => {
        const next = new Set(s.recentlyUpdated);
        next.delete(created.id);
        return { recentlyUpdated: next };
      });
    }, 2000);
  },
}));

async function performSave(
  set: (partial: Partial<DealsState> | ((s: DealsState) => Partial<DealsState>)) => void,
  get: () => DealsState,
  id: string,
  version: number,
  changes: Partial<DealMutableFields>
) {
  try {
    const updated = await patchDeal(id, version, changes);
    set((s) => {
      const { [id]: _removed, ...rest } = s.pending;
      // A save can move a deal out of (or back into) the active filtered view — most
      // notably archiving, but also e.g. editing a deal's stage while filtered to a
      // different one. Keep `order`/`total` in sync rather than leaving a stale row
      // behind or an archived one lingering in the pipeline.
      const stillMatches = matchesFilters(updated, s.filters);
      const idx = s.order.indexOf(id);
      let order = s.order;
      let total = s.total;
      if (!stillMatches && idx !== -1) {
        order = s.order.filter((x) => x !== id);
        total = Math.max(0, s.total - 1);
      } else if (stillMatches && idx === -1) {
        order = [...s.order, id];
        total = s.total + 1;
      }
      return {
        deals: { ...s.deals, [id]: updated },
        pending: rest,
        order,
        total,
      };
    });
  } catch (err) {
    if (err instanceof ConflictApiError) {
      const pending = get().pending[id];
      set((s) => ({
        pending: {
          ...s.pending,
          [id]: { ...pending, status: "conflict", conflictCurrent: err.current },
        },
      }));
      return;
    }

    const pending = get().pending[id];
    if (!pending) return;
    set((s) => ({
      deals: { ...s.deals, [id]: { ...s.deals[id], ...pending.previous } },
      pending: {
        ...s.pending,
        [id]: {
          ...pending,
          status: "failed",
          error: err instanceof ApiError ? err.message : "save failed",
        },
      },
    }));
    toast.error("Save failed — change reverted", {
      action: { label: "Retry", onClick: () => get().retry(id) },
    });
  }
}
