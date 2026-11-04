"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 44;

const COLUMNS = [
  { id: "select", size: 36, fixed: true },
  { id: "status", size: 36, fixed: true },
  { id: "name", size: 260, fixed: false },
  { id: "stage", size: 140, fixed: false },
  { id: "value", size: 120, fixed: false },
  { id: "owner", size: 150, fixed: false },
  { id: "priority", size: 110, fixed: false },
  { id: "closeDate", size: 110, fixed: false },
  { id: "updatedAt", size: 100, fixed: false },
] as const;

function columnStyle(size: number, fixed?: boolean): CSSProperties {
  return fixed ? { flex: `0 0 ${size}px`, width: size } : { flex: `${size} ${size} 0px`, minWidth: 80 };
}

function Bar({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded", className)} />;
}

function SkeletonCell({ columnId }: { columnId: (typeof COLUMNS)[number]["id"] }) {
  switch (columnId) {
    case "select":
    case "status":
      return <Bar className="h-4 w-4" />;
    case "name":
      return (
        <div className="w-full space-y-1.5">
          <Bar className="mx-auto h-3 w-3/4" />
          <Bar className="mx-auto h-2.5 w-1/2" />
        </div>
      );
    case "stage":
      return <Bar className="h-7 w-[132px] rounded-full" />;
    case "priority":
      return <Bar className="h-7 w-[104px] rounded-md" />;
    default:
      return <Bar className="mx-auto h-3 w-3/4" />;
  }
}

/**
 * Mirrors the real table's column proportions and row height so the swap from skeleton to
 * live data on load doesn't visually jump — placeholder shapes sit exactly where the real
 * pill/text/checkbox will land.
 */
export function TableSkeleton({ rows = 14 }: { rows?: number }) {
  return (
    <div
      className="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
      aria-hidden="true"
    >
      <div className="overflow-x-auto">
        <div className="flex min-w-[800px] border-b border-gray-200 bg-gray-50 px-0 py-2.5">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              style={columnStyle(col.size, col.fixed)}
              className="flex items-center justify-center px-2"
            >
              {col.id !== "select" && col.id !== "status" && <Bar className="h-2.5 w-10" />}
            </div>
          ))}
        </div>

        <div className="min-w-[800px]">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center border-b border-gray-100"
              style={{ height: ROW_HEIGHT }}
            >
              {COLUMNS.map((col) => (
                <div
                  key={col.id}
                  style={columnStyle(col.size, col.fixed)}
                  className="flex items-center justify-center px-2"
                >
                  <SkeletonCell columnId={col.id} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
