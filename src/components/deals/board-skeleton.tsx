"use client";

import { STAGES } from "@/lib/deals/types";
import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded", className)} />;
}

/** Mirrors the real board's column/card shape while the first page of deals is still loading. */
export function BoardSkeleton({ cardsPerColumn = 5 }: { cardsPerColumn?: number }) {
  return (
    <div className="flex flex-1 gap-3 overflow-x-auto pb-2" aria-hidden="true">
      {STAGES.map((stage) => (
        <div
          key={stage}
          className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50 shadow-sm"
        >
          <div className="h-1 bg-gray-200" />
          <div className="border-b border-gray-200 bg-white px-3 py-2">
            <Bar className="h-4 w-20" />
            <Bar className="mt-1.5 h-2.5 w-14" />
          </div>
          <div className="space-y-2 p-2">
            {Array.from({ length: cardsPerColumn }).map((_, i) => (
              <div key={i} className="rounded-md border border-gray-200 bg-white p-2 shadow-sm">
                <Bar className="h-3.5 w-3/4" />
                <Bar className="mt-1.5 h-2.5 w-1/2" />
                <div className="mt-2 flex items-center justify-between">
                  <Bar className="h-2.5 w-12" />
                  <Bar className="h-2.5 w-14" />
                </div>
                <Bar className="mt-1.5 h-6 w-full rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
