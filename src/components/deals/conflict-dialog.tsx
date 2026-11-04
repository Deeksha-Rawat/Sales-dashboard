"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/primitives";
import { useDealsStore } from "@/store/deals-store";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { PRIORITY_LABELS, STAGE_LABELS } from "@/lib/deals/types";
import { AlertTriangle, Check, User, Users } from "lucide-react";

/** Surfaces the first in-flight conflict; resolving one re-renders to show the next, if any. */
export function ConflictDialog() {
  const pending = useDealsStore((s) => s.pending);
  const deals = useDealsStore((s) => s.deals);
  const resolveConflict = useDealsStore((s) => s.resolveConflict);
  const dismissPending = useDealsStore((s) => s.dismissPending);

  const conflictId = Object.keys(pending).find((id) => pending[id].status === "conflict");
  if (!conflictId) return null;

  const entry = pending[conflictId];
  const mine = { ...deals[conflictId], ...entry.changes };
  const theirs = entry.conflictCurrent!;

  const fields: { label: string; key: "stage" | "value" | "owner" | "priority"; format: (v: unknown) => string }[] = [
    { label: "Stage", key: "stage", format: (v) => STAGE_LABELS[v as keyof typeof STAGE_LABELS] ?? String(v) },
    { label: "Value", key: "value", format: (v) => formatCurrency(Number(v) || 0) },
    { label: "Owner", key: "owner", format: (v) => String(v ?? "") },
    {
      label: "Priority",
      key: "priority",
      format: (v) => PRIORITY_LABELS[v as keyof typeof PRIORITY_LABELS] ?? String(v),
    },
  ];

  return (
    <Dialog open title="Someone else updated this deal" onClose={() => dismissPending(conflictId)}>
      <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <p className="text-sm text-amber-900">
          <span className="font-semibold">{theirs.name}</span> was changed by another user{" "}
          {theirs.updatedAt ? formatRelativeTime(theirs.updatedAt) : "moments ago"}, while you were editing it.
          Nothing has been saved yet — pick which version to keep.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div className="overflow-hidden rounded-md border border-blue-200">
          <div className="flex items-center gap-1.5 border-b border-blue-200 bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
            <User className="h-3.5 w-3.5" /> Your version
          </div>
          <div className="divide-y divide-gray-100 px-3">
            {fields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={f.format(mine[f.key])}
                changed={mine[f.key] !== theirs[f.key]}
                tone="blue"
              />
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-md border border-amber-200">
          <div className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
            <Users className="h-3.5 w-3.5" /> Their version
          </div>
          <div className="divide-y divide-gray-100 px-3">
            {fields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={f.format(theirs[f.key])}
                changed={mine[f.key] !== theirs[f.key]}
                tone="amber"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => resolveConflict(conflictId, "theirs")}>
          Keep theirs
        </Button>
        <Button variant="primary" onClick={() => resolveConflict(conflictId, "mine")}>
          <Check className="h-4 w-4" /> Keep mine
        </Button>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  value,
  changed,
  tone,
}: {
  label: string;
  value: string;
  changed: boolean;
  tone: "blue" | "amber";
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-gray-500">{label}</span>
      <span
        className={cn(
          "font-medium text-gray-900",
          changed &&
            (tone === "blue"
              ? "rounded bg-blue-50 px-1.5 py-0.5 text-blue-700"
              : "rounded bg-amber-50 px-1.5 py-0.5 text-amber-700")
        )}
      >
        {value}
      </span>
    </div>
  );
}
