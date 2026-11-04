"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDealDetail } from "@/lib/deals/api-client";
import { DealMutableFields, PRIORITIES, PRIORITY_LABELS, STAGES, STAGE_LABELS } from "@/lib/deals/types";
import { OWNERS } from "@/lib/deals/generator";
import { formatCurrency, formatRelativeTime, cn } from "@/lib/utils";
import { useDealsStore } from "@/store/deals-store";
import { Loader2, X } from "lucide-react";
import { Button, Input, Option, Select } from "@/components/ui/primitives";

type EditableDraft = Pick<
  DealMutableFields,
  "stage" | "value" | "owner" | "priority" | "closeDate" | "contactName" | "contactEmail" | "notes"
>;

function draftFrom(data: EditableDraft): EditableDraft {
  return {
    stage: data.stage,
    value: data.value,
    owner: data.owner,
    priority: data.priority,
    closeDate: data.closeDate,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    notes: data.notes,
  };
}

export function DealDetailDrawer({
  id,
  mode,
  onClose,
}: {
  id: string | null;
  mode: "view" | "edit";
  onClose: () => void;
}) {
  const editable = mode === "edit";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["deal", id],
    queryFn: () => fetchDealDetail(id!),
    enabled: !!id,
  });
  const updateDeal = useDealsStore((s) => s.updateDeal);
  const status = useDealsStore((s) => (id ? s.pending[id]?.status : undefined));

  const [draft, setDraft] = useState<EditableDraft | null>(null);
  // Tracked separately from the react-query cache (which doesn't get updated by our
  // zustand-driven save) — comparing against it would leave the dirty-check permanently
  // "changed" after the first edit and the Save button stuck enabled.
  const [saved, setSaved] = useState<EditableDraft | null>(null);
  const [loadedDealId, setLoadedDealId] = useState<string | null>(null);
  // Reset the draft when a different deal's data arrives — done during render (the React-
  // recommended way to adjust state from a prop/query change) rather than in an effect, so
  // it doesn't cause an extra cascading render.
  if (data && data.id !== loadedDealId) {
    setLoadedDealId(data.id);
    setDraft(draftFrom(data));
    setSaved(draftFrom(data));
  }

  const dirty = !!draft && !!saved && Object.keys(draft).some((k) => {
    const key = k as keyof EditableDraft;
    return draft[key] !== saved![key];
  });

  function patch(changes: Partial<EditableDraft>) {
    setDraft((d) => (d ? { ...d, ...changes } : d));
  }

  // Nothing is sent to the server until this is called — picking a new owner, stage, date,
  // etc. only updates local draft state. This is the whole point: editing happens in one
  // batch via an explicit action, not field-by-field autosave on blur/click.
  function commitAll() {
    if (!id || !editable || !draft || !saved || !dirty) return;
    const changes: Partial<DealMutableFields> = {};
    (Object.keys(draft) as (keyof EditableDraft)[]).forEach((key) => {
      if (draft[key] !== saved[key]) {
        (changes as Record<string, unknown>)[key] = draft[key];
      }
    });
    updateDeal(id, changes, { undoLabel: "deal details" });
    setSaved(draft);
  }

  function handleClose() {
    commitAll();
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
  }, [id, draft, data]);

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
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-gray-900">{data.name}</h2>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                      editable ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {editable ? "Editing" : "Viewing"}
                  </span>
                </div>
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

            {data && draft && (
              <>
                <dl className="space-y-2 text-sm">
                  {editable ? (
                    <>
                      <FieldRow label="Stage">
                        <Select
                          size="sm"
                          className="w-full"
                          value={draft.stage}
                          onChange={(v) => patch({ stage: v as typeof draft.stage })}
                          aria-label="Stage"
                        >
                          {STAGES.map((s) => (
                            <Option key={s} value={s}>
                              {STAGE_LABELS[s]}
                            </Option>
                          ))}
                        </Select>
                      </FieldRow>
                      <FieldRow label="Value">
                        <Input
                          type="number"
                          min={0}
                          value={draft.value}
                          onChange={(e) => patch({ value: Number(e.target.value) })}
                          aria-label="Value"
                          className="h-8 w-full"
                        />
                      </FieldRow>
                      <FieldRow label="Owner">
                        <Select
                          size="sm"
                          className="w-full"
                          value={draft.owner}
                          onChange={(v) => patch({ owner: v })}
                          aria-label="Owner"
                        >
                          {OWNERS.map((o) => (
                            <Option key={o} value={o}>
                              {o}
                            </Option>
                          ))}
                        </Select>
                      </FieldRow>
                      <FieldRow label="Priority">
                        <Select
                          size="sm"
                          className="w-full"
                          value={draft.priority}
                          onChange={(v) => patch({ priority: v as typeof draft.priority })}
                          aria-label="Priority"
                        >
                          {PRIORITIES.map((p) => (
                            <Option key={p} value={p}>
                              {PRIORITY_LABELS[p]}
                            </Option>
                          ))}
                        </Select>
                      </FieldRow>
                      <FieldRow label="Close date">
                        <Input
                          type="date"
                          value={draft.closeDate}
                          onChange={(e) => patch({ closeDate: e.target.value })}
                          aria-label="Close date"
                          className="h-8"
                        />
                      </FieldRow>
                      <FieldRow label="Contact">
                        <Input
                          value={draft.contactName}
                          onChange={(e) => patch({ contactName: e.target.value })}
                          aria-label="Contact name"
                          className="h-8"
                        />
                      </FieldRow>
                      <FieldRow label="Email">
                        <Input
                          type="email"
                          value={draft.contactEmail}
                          onChange={(e) => patch({ contactEmail: e.target.value })}
                          aria-label="Contact email"
                          className="h-8"
                        />
                      </FieldRow>
                    </>
                  ) : (
                    <>
                      <Row label="Stage" value={STAGE_LABELS[data.stage]} />
                      <Row label="Value" value={formatCurrency(data.value)} />
                      <Row label="Owner" value={data.owner} />
                      <Row label="Priority" value={data.priority} />
                      <Row label="Close date" value={data.closeDate} />
                      <Row label="Contact" value={data.contactName} />
                      <Row label="Email" value={data.contactEmail} />
                    </>
                  )}

                  {/* Last updated is never editable, in either mode. */}
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
                  {editable ? (
                    <textarea
                      value={draft.notes}
                      onChange={(e) => patch({ notes: e.target.value })}
                      placeholder="Add a remark…"
                      rows={4}
                      aria-label="Remarks"
                      className={cn(
                        "w-full resize-none rounded-md border border-gray-200 p-2 text-sm text-gray-700",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                      )}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap rounded-md border border-gray-100 bg-gray-50 p-2 text-sm text-gray-700">
                      {data.notes || "No remark yet."}
                    </p>
                  )}
                </div>

                {editable && (
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-400">
                      {dirty ? "You have unsaved changes." : "No changes yet."}
                    </p>
                    <Button size="sm" variant="primary" disabled={!dirty} onClick={commitAll}>
                      Save changes
                    </Button>
                  </div>
                )}
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

/** Every field row shares the same label width and the same fixed-width input slot, so the
 *  column of inputs lines up as one even block instead of each control hugging its own
 *  content width (a `Select` otherwise sizes to its selected option's text). */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1.5">
      <dt className="w-20 shrink-0 text-gray-500">{label}</dt>
      <dd className="w-44 shrink-0">{children}</dd>
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
