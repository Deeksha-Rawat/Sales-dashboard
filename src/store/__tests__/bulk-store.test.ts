import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealSummary } from "@/lib/deals/types";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

const bulkUpdateDealsMock = vi.fn();
vi.mock("@/lib/deals/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deals/api-client")>("@/lib/deals/api-client");
  return { ...actual, bulkUpdateDeals: (...args: unknown[]) => bulkUpdateDealsMock(...args) };
});

import { chunk, useBulkStore } from "../bulk-store";
import { useDealsStore } from "../deals-store";

function summary(id: string): DealSummary {
  return {
    id,
    name: id,
    company: "Acme",
    owner: "Alex",
    value: 100,
    stage: "new_lead",
    priority: "low",
    closeDate: "2026-12-01",
    updatedAt: "2026-11-01T00:00:00.000Z",
    version: 1,
    archived: false,
  };
}

beforeEach(() => {
  bulkUpdateDealsMock.mockReset();
  useBulkStore.setState({ phase: "idle", total: 0, processed: 0, succeededIds: [], failedIds: [], lastChanges: null });
  useDealsStore.setState({ deals: {}, order: [] });
});

describe("chunk", () => {
  it("splits into groups of the given size, last group may be smaller", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("bulk-store run", () => {
  it("tracks partial failures without blocking the succeeded rows", async () => {
    const ids = ["a", "b", "c"];
    bulkUpdateDealsMock.mockResolvedValue({
      results: [
        { id: "a", success: true, record: { ...summary("a"), stage: "won", version: 2 } },
        { id: "b", success: false, error: "server_error" },
        { id: "c", success: true, record: { ...summary("c"), stage: "won", version: 2 } },
      ],
    });

    await useBulkStore.getState().run(ids, { stage: "won" });

    const state = useBulkStore.getState();
    expect(state.phase).toBe("done");
    expect(state.succeededIds.sort()).toEqual(["a", "c"]);
    expect(state.failedIds).toEqual(["b"]);
    expect(useDealsStore.getState().deals["a"].stage).toBe("won");
  });

  it("retryFailed re-runs only the previously failed ids", async () => {
    bulkUpdateDealsMock.mockResolvedValueOnce({
      results: [
        { id: "a", success: false, error: "server_error" },
        { id: "b", success: true, record: { ...summary("b"), stage: "won", version: 2 } },
      ],
    });
    await useBulkStore.getState().run(["a", "b"], { stage: "won" });
    expect(useBulkStore.getState().failedIds).toEqual(["a"]);

    bulkUpdateDealsMock.mockResolvedValueOnce({
      results: [{ id: "a", success: true, record: { ...summary("a"), stage: "won", version: 2 } }],
    });
    await useBulkStore.getState().retryFailed();

    expect(bulkUpdateDealsMock).toHaveBeenLastCalledWith(["a"], { stage: "won" });
    expect(useBulkStore.getState().failedIds).toEqual([]);
  });

  it("treats a whole-chunk network failure as every id in that chunk failing", async () => {
    bulkUpdateDealsMock.mockRejectedValue(new Error("network down"));

    await useBulkStore.getState().run(["a", "b"], { stage: "won" });

    expect(useBulkStore.getState().failedIds.sort()).toEqual(["a", "b"]);
    expect(useBulkStore.getState().succeededIds).toEqual([]);
  });
});
