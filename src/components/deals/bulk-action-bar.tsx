"use client";

import { useEffect } from "react";
import { useDealsStore } from "@/store/deals-store";
import { useBulkStore } from "@/store/bulk-store";
import { STAGES, STAGE_LABELS, Stage } from "@/lib/deals/types";
import { Button, Option, Progress, Select } from "@/components/ui/primitives";
import { toast } from "sonner";

export function BulkActionBar() {
  const selected = useDealsStore((s) => s.selected);
  const clearSelection = useDealsStore((s) => s.clearSelection);
  const { phase, total, processed, succeededIds, failedIds, run, retryFailed, reset } = useBulkStore();

  useEffect(() => {
    if (phase === "done") {
      if (failedIds.length === 0) {
        toast.success(`Updated ${succeededIds.length} deal${succeededIds.length === 1 ? "" : "s"}`);
      } else {
        toast.warning(`${succeededIds.length} succeeded, ${failedIds.length} failed`, {
          action: { label: "Retry failed", onClick: () => retryFailed() },
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (selected.size === 0 && phase === "idle") return null;

  const ids = Array.from(selected);

  async function bulkSetStage(stage: Stage) {
    await run(ids, { stage });
    clearSelection();
  }

  return (
    <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
      {phase === "running" || phase === "done" ? (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>
                Updating {processed}/{total}
                {phase === "done" && ` — ${succeededIds.length} ok, ${failedIds.length} failed`}
              </span>
            </div>
            <Progress value={processed} max={total} />
          </div>
          {phase === "done" && failedIds.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => retryFailed()}>
              Retry failed
            </Button>
          )}
          {phase === "done" && (
            <Button size="sm" variant="ghost" onClick={() => reset()}>
              Dismiss
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700">
            {selected.size} selected
          </span>
          <Select
            size="sm"
            value=""
            placeholder="Move to stage…"
            onChange={(v) => {
              if (v) bulkSetStage(v as Stage);
            }}
            aria-label="Bulk move to stage"
          >
            {STAGES.map((s) => (
              <Option key={s} value={s}>
                {STAGE_LABELS[s]}
              </Option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Clear selection
          </Button>
        </div>
      )}
    </div>
  );
}
