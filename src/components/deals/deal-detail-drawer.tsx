"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDealDetail } from "@/lib/deals/api-client";
import { STAGE_LABELS } from "@/lib/deals/types";
import { formatCurrency, formatRelativeTime, cn } from "@/lib/utils";
import { useDealsStore } from "@/store/deals-store";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function DealDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["deal", id],
    queryFn: () => fetchDealDetail(id!),
    enabled: !!id,
  });
  const updateDeal = useDealsStore((s) => s.updateDeal);
  const status = useDealsStore((s) => (id ? s.pending[id]?.status : undefined));

  const [notesDraft, setNotesDraft] = useState("");
  // Tracked separately from `data.notes` (the react-query cache), which doesn't get updated
  // by our zustand-driven save — comparing against it would leave the dirty-check permanently
  // "changed" after the first edit and the Save button stuck enabled.
  const [savedNotes, setSavedNotes] = useState("");
  const [loadedDealId, setLoadedDealId] = useState<string | null>(null);
  // Reset the draft when a different deal's data arrives — done during render (the React-
  // recommended way to adjust state from a prop/query change) rather than in an effect, so
  // it doesn't cause an extra cascading render.
  if (data && data.id !== loadedDealId) {
    setLoadedDealId(data.id);
    setNotesDraft(data.notes ?? "");
    setSavedNotes(data.notes ?? "");
  }

  const notesDirty = notesDraft !== savedNotes;

  function commitNotes() {
    if (!id || !notesDirty) return;
    updateDeal(id, { notes: notesDraft }, { undoLabel: "remark" });
    setSavedNotes(notesDraft);
  }

  function handleClose() {
    commitNotes();
    onClose();
  }

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, notesDraft, data]);

  return (
    <>
      <div
        onClick={handleClose}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-30 bg-black/20 transition-opacity",
          id ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Deal detail"
        aria-hidden={!id}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl transition-transform",
          id ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-start justify-between border-b border-gray-100 p-5 pb-4">
          <div className="min-w-0 flex-1">
            {data ? (
              <>
                <h2 className="truncate text-lg font-semibold text-gray-900">{data.name}</h2>
                <p className="text-sm text-gray-500">{data.company}</p>
              </>
            ) : isLoading ? (
              <div className="space-y-2">
                <div className="shimmer h-5 w-40 rounded" />
                <div className="shimmer h-3.5 w-24 rounded" />
              </div>
            ) : (
              <h2 className="text-lg font-semibold text-gray-900">Deal detail</h2>
            )}
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-label="Close detail panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {id && (
          <div className="flex-1 overflow-y-auto p-5 pt-4">
            {isLoading && <DrawerSkeleton />}
            {isError && <p className="text-sm text-red-600">Failed to load deal details.</p>}

            {data && (
              <>
                <dl className="space-y-2 text-sm">
                  <Row label="Stage" value={STAGE_LABELS[data.stage]} />
                  <Row label="Value" value={formatCurrency(data.value)} />
                  <Row label="Owner" value={data.owner} />
                  <Row label="Priority" value={data.priority} />
                  <Row label="Close date" value={data.closeDate} />
                  <Row label="Contact" value={data.contactName} />
                  <Row label="Email" value={data.contactEmail} />
                  <Row label="Last updated" value={formatRelativeTime(data.updatedAt)} />
                </dl>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase text-gray-400">Remarks</h3>
                    {status === "saving" && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                      </span>
                    )}
                  </div>
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Add a remark…"
                    rows={4}
                    className={cn(
                      "w-full resize-none rounded-md border border-gray-200 p-2 text-sm text-gray-700",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    )}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400">
                      {savedNotes ? "Edit and save to update this remark." : "No remark yet."}
                    </p>
                    <Button size="sm" variant="primary" disabled={!notesDirty} onClick={handleClose}>
                      {savedNotes ? "Update remark" : "Add remark"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-1.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** Mirrors the loaded drawer's row/remarks shape so there's no layout jump once data arrives. */
function DrawerSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="space-y-2.5 text-sm">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between border-b border-gray-100 pb-2.5">
            <div className="shimmer h-3 w-16 rounded" />
            <div className="shimmer h-3 w-24 rounded" />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="shimmer mb-2 h-3 w-16 rounded" />
        <div className="shimmer h-24 w-full rounded-md" />
      </div>
    </div>
  );
}
