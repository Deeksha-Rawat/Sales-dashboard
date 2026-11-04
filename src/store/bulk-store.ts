import { create } from "zustand";
import { bulkUpdateDeals } from "@/lib/deals/api-client";
import { DealMutableFields } from "@/lib/deals/types";
import { useDealsStore } from "./deals-store";

const CHUNK_SIZE = 50;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type BulkPhase = "idle" | "running" | "done";

interface BulkState {
  phase: BulkPhase;
  total: number;
  processed: number;
  succeededIds: string[];
  failedIds: string[];
  lastChanges: Partial<DealMutableFields> | null;

  run: (ids: string[], changes: Partial<DealMutableFields>) => Promise<void>;
  retryFailed: () => Promise<void>;
  reset: () => void;
}

export const useBulkStore = create<BulkState>((set, get) => ({
  phase: "idle",
  total: 0,
  processed: 0,
  succeededIds: [],
  failedIds: [],
  lastChanges: null,

  run: async (ids, changes) => {
    set({
      phase: "running",
      total: ids.length,
      processed: 0,
      succeededIds: [],
      failedIds: [],
      lastChanges: changes,
    });

    const chunks = chunk(ids, CHUNK_SIZE);
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const group of chunks) {
      try {
        const res = await bulkUpdateDeals(group, changes);
        for (const result of res.results) {
          if (result.success && result.record) {
            succeeded.push(result.id);
            useDealsStore.getState().applyServerRecord(result.record);
          } else {
            failed.push(result.id);
          }
        }
      } catch {
        // whole-chunk network failure: mark every id in the chunk as failed
        failed.push(...group);
      }

      set((s) => ({
        processed: s.processed + group.length,
        succeededIds: [...succeeded],
        failedIds: [...failed],
      }));
    }

    set({ phase: "done" });
  },

  retryFailed: async () => {
    const { failedIds, lastChanges } = get();
    if (!failedIds.length || !lastChanges) return;
    await get().run(failedIds, lastChanges);
  },

  reset: () =>
    set({ phase: "idle", total: 0, processed: 0, succeededIds: [], failedIds: [], lastChanges: null }),
}));
