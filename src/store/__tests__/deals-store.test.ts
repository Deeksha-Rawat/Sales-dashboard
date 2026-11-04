import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictApiError, ApiError } from "@/lib/deals/api-client";
import { Deal, DealSummary } from "@/lib/deals/types";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

const patchDealMock = vi.fn();
const fetchDealChangesMock = vi.fn();
const fetchDealsMock = vi.fn();
const fetchDealIdsMock = vi.fn();
const deleteDealApiMock = vi.fn();
vi.mock("@/lib/deals/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deals/api-client")>("@/lib/deals/api-client");
  return {
    ...actual,
    patchDeal: (...args: unknown[]) => patchDealMock(...args),
    fetchDeals: (...args: unknown[]) => fetchDealsMock(...args),
    fetchDealChanges: (...args: unknown[]) => fetchDealChangesMock(...args),
    fetchDealIds: (...args: unknown[]) => fetchDealIdsMock(...args),
    deleteDeal: (...args: unknown[]) => deleteDealApiMock(...args),
  };
});

import { useDealsStore } from "../deals-store";

function makeSummary(overrides: Partial<DealSummary> = {}): DealSummary {
  return {
    id: "deal_1",
    name: "Acme - Expansion",
    company: "Acme Inc",
    owner: "Alex Chen",
    value: 10000,
    stage: "new_lead",
    priority: "medium",
    closeDate: "2026-12-01",
    updatedAt: "2026-11-01T00:00:00.000Z",
    version: 1,
    archived: false,
    ...overrides,
  };
}

function seedStore(summary: DealSummary) {
  useDealsStore.setState({
    deals: { [summary.id]: summary },
    order: [summary.id],
    total: 1,
    owners: [summary.owner],
    pending: {},
    undoStack: [],
    selected: new Set(),
  });
}

beforeEach(() => {
  patchDealMock.mockReset();
  fetchDealChangesMock.mockReset();
  fetchDealsMock.mockReset();
  fetchDealIdsMock.mockReset();
  deleteDealApiMock.mockReset();
  useDealsStore.setState({
    deals: {},
    order: [],
    pending: {},
    undoStack: [],
    selected: new Set(),
    lastSyncAt: null,
    recentlyUpdated: new Set(),
    nextCursor: null,
    hasMore: false,
    loadingMore: false,
    filters: { search: "", stage: [], owner: [], priority: [], archived: false },
  });
});

describe("deals-store updateDeal", () => {
  it("applies the change optimistically, then confirms on success", async () => {
    const summary = makeSummary();
    seedStore(summary);
    const serverRecord = { ...summary, stage: "contacted", version: 2 } as Deal;
    patchDealMock.mockResolvedValue(serverRecord);

    const promise = useDealsStore.getState().updateDeal(summary.id, { stage: "contacted" });

    // optimistic state applied synchronously
    expect(useDealsStore.getState().deals[summary.id].stage).toBe("contacted");
    expect(useDealsStore.getState().pending[summary.id].status).toBe("saving");

    await promise;

    expect(useDealsStore.getState().pending[summary.id]).toBeUndefined();
    expect(useDealsStore.getState().deals[summary.id].version).toBe(2);
  });

  it("reverts the optimistic change and marks failed when the save errors", async () => {
    const summary = makeSummary();
    seedStore(summary);
    patchDealMock.mockRejectedValue(new ApiError(500, "server_error"));

    await useDealsStore.getState().updateDeal(summary.id, { stage: "contacted" });

    const state = useDealsStore.getState();
    expect(state.deals[summary.id].stage).toBe("new_lead"); // reverted
    expect(state.pending[summary.id].status).toBe("failed");
  });

  it("retry re-attempts the save with the same changes", async () => {
    const summary = makeSummary();
    seedStore(summary);
    patchDealMock.mockRejectedValueOnce(new ApiError(500, "server_error"));
    await useDealsStore.getState().updateDeal(summary.id, { stage: "contacted" });
    expect(useDealsStore.getState().pending[summary.id].status).toBe("failed");

    const serverRecord = { ...summary, stage: "contacted", version: 2 } as Deal;
    patchDealMock.mockResolvedValueOnce(serverRecord);
    await useDealsStore.getState().retry(summary.id);

    expect(useDealsStore.getState().pending[summary.id]).toBeUndefined();
    expect(useDealsStore.getState().deals[summary.id].stage).toBe("contacted");
  });

  it("surfaces a conflict without silently overwriting, and 'keep mine' resends on the latest version", async () => {
    const summary = makeSummary();
    seedStore(summary);
    const serverCurrent = { ...summary, stage: "won", owner: "Priya Patel", version: 5 } as Deal;
    patchDealMock.mockRejectedValueOnce(new ConflictApiError(serverCurrent));

    await useDealsStore.getState().updateDeal(summary.id, { stage: "contacted" });

    let state = useDealsStore.getState();
    expect(state.pending[summary.id].status).toBe("conflict");
    expect(state.pending[summary.id].conflictCurrent?.version).toBe(5);

    const resolvedRecord = { ...serverCurrent, stage: "contacted", version: 6 } as Deal;
    patchDealMock.mockResolvedValueOnce(resolvedRecord);
    await useDealsStore.getState().resolveConflict(summary.id, "mine");

    state = useDealsStore.getState();
    expect(state.pending[summary.id]).toBeUndefined();
    expect(state.deals[summary.id].stage).toBe("contacted");
    expect(state.deals[summary.id].version).toBe(6);
    // patchDeal must have been called with the server's version (5), not the stale local one
    expect(patchDealMock).toHaveBeenLastCalledWith(summary.id, 5, { stage: "contacted" });
  });

  it("'keep theirs' discards local changes and accepts the server record", async () => {
    const summary = makeSummary();
    seedStore(summary);
    const serverCurrent = { ...summary, stage: "won", version: 5 } as Deal;
    patchDealMock.mockRejectedValueOnce(new ConflictApiError(serverCurrent));

    await useDealsStore.getState().updateDeal(summary.id, { stage: "contacted" });
    await useDealsStore.getState().resolveConflict(summary.id, "theirs");

    const state = useDealsStore.getState();
    expect(state.pending[summary.id]).toBeUndefined();
    expect(state.deals[summary.id].stage).toBe("won");
    expect(patchDealMock).toHaveBeenCalledTimes(1); // no extra network call for "theirs"
  });

  it("undo reapplies the inverse change through the same save pipeline", async () => {
    const summary = makeSummary({ stage: "new_lead" });
    seedStore(summary);
    patchDealMock.mockResolvedValueOnce({ ...summary, stage: "contacted", version: 2 } as Deal);
    await useDealsStore.getState().updateDeal(summary.id, { stage: "contacted" }, { undoLabel: "stage" });

    expect(useDealsStore.getState().undoStack).toHaveLength(1);

    patchDealMock.mockResolvedValueOnce({ ...summary, stage: "new_lead", version: 3 } as Deal);
    await useDealsStore.getState().undo();

    expect(useDealsStore.getState().deals[summary.id].stage).toBe("new_lead");
    expect(useDealsStore.getState().undoStack).toHaveLength(0);
  });
});

describe("deals-store backgroundSync", () => {
  it("does nothing until an initial sync point exists", async () => {
    await useDealsStore.getState().backgroundSync();
    expect(fetchDealChangesMock).not.toHaveBeenCalled();
  });

  it("quietly merges a teammate's change into an idle row", async () => {
    const summary = makeSummary();
    seedStore(summary);
    useDealsStore.setState({ lastSyncAt: "2026-11-01T00:00:00.000Z" });

    const changed = { ...summary, stage: "won", version: 2, updatedAt: "2026-11-01T00:00:05.000Z" };
    fetchDealChangesMock.mockResolvedValueOnce({
      changed: [changed],
      serverTime: "2026-11-01T00:00:05.000Z",
    });

    await useDealsStore.getState().backgroundSync();

    const state = useDealsStore.getState();
    expect(state.deals[summary.id].stage).toBe("won");
    expect(state.lastSyncAt).toBe("2026-11-01T00:00:05.000Z");
    expect(state.recentlyUpdated.has(summary.id)).toBe(true);
  });

  it("never overwrites a row that has a save in flight", async () => {
    const summary = makeSummary();
    seedStore(summary);
    useDealsStore.setState({
      lastSyncAt: "2026-11-01T00:00:00.000Z",
      pending: { [summary.id]: { status: "saving", previous: {}, changes: { stage: "contacted" } } },
    });

    const changed = { ...summary, stage: "lost", version: 9, updatedAt: "2026-11-01T00:00:05.000Z" };
    fetchDealChangesMock.mockResolvedValueOnce({
      changed: [changed],
      serverTime: "2026-11-01T00:00:05.000Z",
    });

    await useDealsStore.getState().backgroundSync();

    // the locally-pending optimistic value survives; the incoming "lost" is dropped
    expect(useDealsStore.getState().deals[summary.id].stage).toBe("new_lead");
  });

  it("removes a row from the view once it no longer matches the active filters", async () => {
    const summary = makeSummary({ stage: "new_lead" });
    seedStore(summary);
    useDealsStore.setState({
      lastSyncAt: "2026-11-01T00:00:00.000Z",
      filters: { search: "", stage: ["new_lead"], owner: [], priority: [], archived: false },
    });

    const changed = { ...summary, stage: "won", version: 2, updatedAt: "2026-11-01T00:00:05.000Z" };
    fetchDealChangesMock.mockResolvedValueOnce({
      changed: [changed],
      serverTime: "2026-11-01T00:00:05.000Z",
    });

    await useDealsStore.getState().backgroundSync();

    const state = useDealsStore.getState();
    expect(state.order).not.toContain(summary.id);
    expect(state.deals[summary.id]).toBeUndefined();
  });

  it("leaves everything as-is on a failed poll, so the next tick retries from the same point", async () => {
    const summary = makeSummary();
    seedStore(summary);
    useDealsStore.setState({ lastSyncAt: "2026-11-01T00:00:00.000Z" });
    fetchDealChangesMock.mockRejectedValueOnce(new Error("network error"));

    await useDealsStore.getState().backgroundSync();

    expect(useDealsStore.getState().lastSyncAt).toBe("2026-11-01T00:00:00.000Z");
    expect(useDealsStore.getState().deals[summary.id].stage).toBe("new_lead");
  });
});

describe("deals-store pagination", () => {
  it("loadDeals replaces the view with just the first page, keeping the real total", () => {
    const rows = [makeSummary({ id: "a" }), makeSummary({ id: "b" })];
    fetchDealsMock.mockResolvedValueOnce({
      rows,
      total: 5000,
      owners: ["Alex Chen"],
      serverTime: "2026-11-01T00:00:05.000Z",
      nextCursor: 2,
      hasMore: true,
    });

    return useDealsStore
      .getState()
      .loadDeals()
      .then(() => {
        const state = useDealsStore.getState();
        expect(state.order).toEqual(["a", "b"]);
        expect(state.total).toBe(5000);
        expect(state.hasMore).toBe(true);
        expect(state.nextCursor).toBe(2);
      });
  });

  it("loadMoreDeals appends the next page instead of replacing the current one", async () => {
    useDealsStore.setState({
      deals: { a: makeSummary({ id: "a" }) },
      order: ["a"],
      total: 4,
      hasMore: true,
      nextCursor: 1,
    });
    fetchDealsMock.mockResolvedValueOnce({
      rows: [makeSummary({ id: "b" }), makeSummary({ id: "c" })],
      total: 4,
      owners: [],
      serverTime: "2026-11-01T00:00:05.000Z",
      nextCursor: null,
      hasMore: false,
    });

    await useDealsStore.getState().loadMoreDeals();

    const state = useDealsStore.getState();
    expect(state.order).toEqual(["a", "b", "c"]);
    expect(state.hasMore).toBe(false);
    expect(state.loadingMore).toBe(false);
  });

  it("does nothing if there's no more to load or a load is already in flight", async () => {
    useDealsStore.setState({ order: ["a"], hasMore: false, nextCursor: null });
    await useDealsStore.getState().loadMoreDeals();
    expect(fetchDealsMock).not.toHaveBeenCalled();

    useDealsStore.setState({ order: ["a"], hasMore: true, nextCursor: 1, loadingMore: true });
    await useDealsStore.getState().loadMoreDeals();
    expect(fetchDealsMock).not.toHaveBeenCalled();
  });

  it("selectAllMatching selects every id matching the filter, not just what's loaded", async () => {
    useDealsStore.setState({ order: ["a"], selected: new Set(["a"]) });
    fetchDealIdsMock.mockResolvedValueOnce({ ids: ["a", "b", "c"], total: 3 });

    await useDealsStore.getState().selectAllMatching();

    expect(useDealsStore.getState().selected).toEqual(new Set(["a", "b", "c"]));
  });
});

describe("deals-store archive and delete", () => {
  it("archiving a deal (via updateDeal) removes it from the active view once saved", async () => {
    const summary = makeSummary({ archived: false });
    seedStore(summary);
    patchDealMock.mockResolvedValueOnce({ ...summary, archived: true, version: 2 });

    await useDealsStore.getState().updateDeal(summary.id, { archived: true }, { undoLabel: "archive" });

    const state = useDealsStore.getState();
    expect(state.order).not.toContain(summary.id);
    expect(state.total).toBe(0);
    // the record itself is kept (not deleted) so undo can restore it to view
    expect(state.deals[summary.id].archived).toBe(true);
  });

  it("undoing an archive re-adds the deal to the view", async () => {
    const summary = makeSummary({ archived: false });
    seedStore(summary);
    patchDealMock.mockResolvedValueOnce({ ...summary, archived: true, version: 2 });
    await useDealsStore.getState().updateDeal(summary.id, { archived: true }, { undoLabel: "archive" });
    expect(useDealsStore.getState().order).not.toContain(summary.id);

    patchDealMock.mockResolvedValueOnce({ ...summary, archived: false, version: 3 });
    await useDealsStore.getState().undo();

    const state = useDealsStore.getState();
    expect(state.order).toContain(summary.id);
    expect(state.total).toBe(1);
    expect(state.deals[summary.id].archived).toBe(false);
  });

  it("deleteDeal optimistically removes the row and confirms on success", async () => {
    const summary = makeSummary();
    seedStore(summary);
    deleteDealApiMock.mockResolvedValueOnce(undefined);

    const promise = useDealsStore.getState().deleteDeal(summary.id);

    // optimistic removal happens synchronously, before the network call resolves
    expect(useDealsStore.getState().deals[summary.id]).toBeUndefined();
    expect(useDealsStore.getState().order).not.toContain(summary.id);

    await promise;
    expect(deleteDealApiMock).toHaveBeenCalledWith(summary.id);
  });

  it("deleteDeal restores the row if the delete request fails", async () => {
    const summary = makeSummary();
    seedStore(summary);
    deleteDealApiMock.mockRejectedValueOnce(new Error("network error"));

    await useDealsStore.getState().deleteDeal(summary.id);

    const state = useDealsStore.getState();
    expect(state.deals[summary.id]).toEqual(summary);
    expect(state.order).toContain(summary.id);
    expect(state.total).toBe(1);
  });
});
