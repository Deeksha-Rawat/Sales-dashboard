"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/primitives";
import { useDealsStore } from "@/store/deals-store";

/** Confirmation gate for the one destructive, non-undoable action in the app. */
export function DeleteConfirmDialog({
  dealId,
  dealName,
  onClose,
}: {
  dealId: string | null;
  dealName: string;
  onClose: () => void;
}) {
  const deleteDeal = useDealsStore((s) => s.deleteDeal);

  return (
    <Dialog open={!!dealId} title="Delete this deal?" onClose={onClose}>
      <p className="mb-4 text-sm text-gray-600">
        <span className="font-medium text-gray-900">{dealName}</span> will be permanently removed. This can&apos;t
        be undone — if you just want it out of the active pipeline, use Archive instead.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (dealId) void deleteDeal(dealId);
            onClose();
          }}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
