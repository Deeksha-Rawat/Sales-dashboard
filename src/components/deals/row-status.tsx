"use client";

import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { RowStatus } from "@/store/deals-store";

export function RowStatusIndicator({
  status,
  onRetry,
}: {
  status: RowStatus;
  onRetry?: () => void;
}) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400" aria-label="Saving">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded px-1 text-xs text-red-600 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
        aria-label="Save failed, retry"
        title="Save failed — click to retry"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <RefreshCw className="h-3 w-3" />
      </button>
    );
  }
  if (status === "conflict") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600" aria-label="Conflict">
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
    );
  }
  return <Check className="h-3.5 w-3.5 text-transparent" aria-hidden />;
}
