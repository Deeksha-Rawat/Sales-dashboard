"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { DealSummary } from "@/lib/deals/types";
import { useDealsStore, SortField } from "@/store/deals-store";
import { Checkbox } from "@/components/ui/primitives";
import { EditableText, PrioritySelect, StageSelect, ValueCell } from "./cell-editors";
import { RowStatusIndicator } from "./row-status";
import { CompanyAvatar } from "./company-avatar";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Menu, type MenuItem } from "@/components/ui/primitives";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  Loader2,
  MoreVertical,
  RefreshCw,
  SquarePen,
  Trash2,
} from "lucide-react";

const LOAD_MORE_THRESHOLD = 20;

const ROW_HEIGHT = 48;
const estimateRowSize = () => ROW_HEIGHT;

const FIXED_COLUMNS = new Set(["select", "status", "actions"]);

/** Fixed-width columns (checkbox, status icon) stay a set size; every other column grows/shrinks
 *  proportionally to its `size` so the table always fills the full width of its container
 *  instead of leaving dead space when the viewport is wider than the sum of the column widths. */
function columnStyle(columnId: string, size: number): CSSProperties {
  return FIXED_COLUMNS.has(columnId)
    ? { flex: `0 0 ${size}px`, width: size }
    : { flex: `${size} ${size} 0px`, minWidth: 80 };
}

export function DealsTable({ onOpenDetail }: { onOpenDetail: (id: string) => void }) {
  const order = useDealsStore((s) => s.order);
  const deals = useDealsStore((s) => s.deals);
  const total = useDealsStore((s) => s.total);
  const selected = useDealsStore((s) => s.selected);
  const pending = useDealsStore((s) => s.pending);
  const recentlyUpdated = useDealsStore((s) => s.recentlyUpdated);
  const sort = useDealsStore((s) => s.sort);
  const setSort = useDealsStore((s) => s.setSort);
  const toggleSelect = useDealsStore((s) => s.toggleSelect);
  const selectIds = useDealsStore((s) => s.selectIds);
  const selectAllVisible = useDealsStore((s) => s.selectAllVisible);
  const selectAllMatching = useDealsStore((s) => s.selectAllMatching);
  const clearSelection = useDealsStore((s) => s.clearSelection);
  const updateDeal = useDealsStore((s) => s.updateDeal);
  const retry = useDealsStore((s) => s.retry);
  const hasMore = useDealsStore((s) => s.hasMore);
  const loadingMore = useDealsStore((s) => s.loadingMore);
  const loadMoreDeals = useDealsStore((s) => s.loadMoreDeals);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Memoized: @tanstack/react-table and @tanstack/react-virtual both treat a new `data`/
  // `columns`/options reference as "things changed" and recompute internally. A fresh array
  // on every render — regardless of whether `order`/`deals` actually changed — was causing
  // continuous, unbounded re-renders (confirmed with a real browser: thousands of DOM
  // mutations per second on an idle page), which is also what made row dropdowns unclickable
  // — the button they were aiming at kept getting torn down and recreated mid-click.
  const rows = useMemo(() => order.map((id) => deals[id]).filter(Boolean), [order, deals]);

  // Shift-click extends the selection from the last clicked row to the current one —
  // the fast path for "move thousands of deals" when a filter alone isn't a tight enough net.
  const shiftPressedRef = useRef(false);
  const lastSelectedIndexRef = useRef<number | null>(null);

  const columns: ColumnDef<DealSummary>[] = useMemo(() => [
    {
      id: "select",
      header: () => (
        <Checkbox
          aria-label="Select all visible"
          checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
          indeterminate={rows.some((r) => selected.has(r.id)) && !rows.every((r) => selected.has(r.id))}
          onChange={(checked) => (checked ? selectAllVisible() : clearSelection())}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.name}`}
          checked={selected.has(row.original.id)}
          onClick={(e: ReactMouseEvent<HTMLInputElement>) => {
            shiftPressedRef.current = e.shiftKey;
          }}
          onChange={() => {
            const idx = row.index;
            if (shiftPressedRef.current && lastSelectedIndexRef.current !== null) {
              const [start, end] = [lastSelectedIndexRef.current, idx].sort((a, b) => a - b);
              selectIds(rows.slice(start, end + 1).map((r) => r.id));
            } else {
              toggleSelect(row.original.id);
            }
            lastSelectedIndexRef.current = idx;
          }}
        />
      ),
      size: 36,
    },
    {
      id: "status",
      header: "",
      cell: ({ row }) => (
        <RowStatusIndicator
          status={pending[row.original.id]?.status ?? "idle"}
          onRetry={() => retry(row.original.id)}
        />
      ),
      size: 36,
    },
    {
      accessorKey: "name",
      header: "Deal",
      size: 260,
      cell: ({ row }) => (
        <div className="flex w-full min-w-0 items-center gap-2">
          <CompanyAvatar name={row.original.company} />
          <div className="min-w-0 text-left">
            <button
              onClick={() => onOpenDetail(row.original.id)}
              className="block max-w-full truncate text-left font-medium text-gray-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              title={row.original.name}
            >
              {row.original.name}
            </button>
            <div className="truncate text-xs text-gray-500">{row.original.company}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "stage",
      header: "Stage",
      size: 140,
      cell: ({ row }) => (
        <StageSelect
          value={row.original.stage}
          disabled={pending[row.original.id]?.status === "saving"}
          onCommit={(v) => updateDeal(row.original.id, { stage: v }, { undoLabel: "stage change" })}
        />
      ),
    },
    {
      accessorKey: "value",
      header: "Value",
      size: 120,
      cell: ({ row }) => (
        <ValueCell
          value={row.original.value}
          disabled={pending[row.original.id]?.status === "saving"}
          onCommit={(v) => updateDeal(row.original.id, { value: v }, { undoLabel: "value change" })}
        />
      ),
    },
    {
      accessorKey: "owner",
      header: "Owner",
      size: 150,
      cell: ({ row }) => (
        <EditableText
          value={row.original.owner}
          disabled={pending[row.original.id]?.status === "saving"}
          onCommit={(v) => updateDeal(row.original.id, { owner: v }, { undoLabel: "owner change" })}
        />
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      size: 110,
      cell: ({ row }) => (
        <PrioritySelect
          value={row.original.priority}
          disabled={pending[row.original.id]?.status === "saving"}
          onCommit={(v) => updateDeal(row.original.id, { priority: v }, { undoLabel: "priority change" })}
        />
      ),
    },
    {
      accessorKey: "closeDate",
      header: "Close date",
      size: 110,
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      size: 100,
      cell: ({ row }) => (
        <span className="text-xs text-gray-500">{formatRelativeTime(row.original.updatedAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 84,
      cell: ({ row }) => {
        const id = row.original.id;
        const failed = pending[id]?.status === "failed";
        const isArchived = row.original.archived;
        const items: MenuItem[] = [
          { label: "View details", icon: <Eye className="h-3.5 w-3.5" />, onClick: () => onOpenDetail(id) },
          ...(failed
            ? [{ label: "Retry save", icon: <RefreshCw className="h-3.5 w-3.5" />, onClick: () => retry(id) }]
            : []),
          {
            label: isArchived ? "Unarchive" : "Archive",
            icon: <Archive className="h-3.5 w-3.5" />,
            onClick: () => updateDeal(id, { archived: !isArchived }, { undoLabel: isArchived ? "unarchive" : "archive" }),
          },
          {
            label: "Delete",
            icon: <Trash2 className="h-3.5 w-3.5" />,
            danger: true,
            onClick: () => setConfirmDeleteId(id),
          },
        ];
        return (
          <div className="flex items-center justify-center gap-0.5">
            <button
              onClick={() => onOpenDetail(id)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              aria-label={`Edit ${row.original.name}`}
              title="Edit"
            >
              <SquarePen className="h-4 w-4" />
            </button>
            <Menu
              items={items}
              aria-label={`More actions for ${row.original.name}`}
              trigger={<MoreVertical className="h-4 w-4" />}
            />
          </div>
        );
      },
    },
  ], [rows, selected, pending, selectAllVisible, clearSelection, selectIds, toggleSelect, retry, updateDeal, onOpenDetail]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Without this, react-table keys rows by array position, not deal identity. That's a
    // real bug once backgroundSync can unshift a newly-matching row to the front of `order`
    // — every row below it would shift position and React would misattribute DOM/state
    // (e.g. an in-progress inline edit) to the wrong deal at that slot.
    getRowId: (row) => row.id,
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => parentRef.current, []);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement,
    estimateSize: estimateRowSize,
    overscan: 12,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualRows.length ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  // Fetch the next page once scrolling gets within LOAD_MORE_THRESHOLD rows of the end of
  // what's loaded — same pattern as a LinkedIn-style feed, just keyed off the virtualizer's
  // own visible range instead of a raw scroll-position listener.
  const lastVirtualIndex = virtualRows.length ? virtualRows[virtualRows.length - 1].index : -1;
  useEffect(() => {
    if (hasMore && !loadingMore && lastVirtualIndex >= rows.length - LOAD_MORE_THRESHOLD) {
      void loadMoreDeals();
    }
  }, [lastVirtualIndex, hasMore, loadingMore, rows.length, loadMoreDeals]);

  const headerGroups = table.getHeaderGroups();

  function toggleSort(field: string) {
    if (FIXED_COLUMNS.has(field)) return;
    const typed = field as SortField;
    if (sort.field === typed) {
      setSort({ field: typed, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      setSort({ field: typed, dir: "asc" });
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <div className="flex min-w-[800px] border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {headerGroups[0].headers.map((header) => (
            <div
              key={header.id}
              style={columnStyle(header.column.id, header.getSize())}
              className={cn(
                "flex items-center gap-1 px-3 py-2.5",
                FIXED_COLUMNS.has(header.column.id) ? "justify-center text-center" : "justify-start text-left",
                !FIXED_COLUMNS.has(header.column.id) && "cursor-pointer select-none"
              )}
              onClick={() => toggleSort(header.column.id)}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
              {!FIXED_COLUMNS.has(header.column.id) && (
                <SortIcon active={sort.field === header.column.id} dir={sort.dir} />
              )}
            </div>
          ))}
        </div>

        <div
          ref={parentRef}
          className="h-[65vh] min-w-[800px] overflow-y-auto"
          aria-label="Deals table"
          role="table"
        >
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              No deals match the current filters.
            </div>
          ) : (
            <div style={{ paddingTop, paddingBottom }}>
              {virtualRows.map((virtualRow) => {
                const row = table.getRowModel().rows[virtualRow.index];
                const isSelected = selected.has(row.original.id);
                const status = pending[row.original.id]?.status ?? "idle";
                const isRecentlyUpdated = recentlyUpdated.has(row.original.id);
                return (
                  <div
                    key={row.id}
                    role="row"
                    style={{ height: ROW_HEIGHT }}
                    className={cn(
                      "flex items-center border-b border-gray-100 text-sm",
                      isSelected && "bg-blue-50",
                      status === "conflict" && "bg-amber-50",
                      status === "failed" && "bg-red-50",
                      isRecentlyUpdated && "row-flash"
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        style={columnStyle(cell.column.id, cell.column.getSize())}
                        className={cn(
                          "flex items-center px-3",
                          FIXED_COLUMNS.has(cell.column.id) ? "justify-center text-center" : "justify-start text-left"
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          {loadingMore ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Loading more…
            </>
          ) : hasMore ? (
            `Showing ${order.length.toLocaleString()} of ${total.toLocaleString()} — scroll for more`
          ) : (
            `Showing all ${order.length.toLocaleString()} deals`
          )}
        </span>
        {hasMore && selected.size === order.length && order.length > 0 && (
          <button
            onClick={() => void selectAllMatching()}
            className="font-medium text-blue-600 hover:underline"
          >
            Select all {total.toLocaleString()} matching filters
          </button>
        )}
      </div>

      <DeleteConfirmDialog
        dealId={confirmDeleteId}
        dealName={(confirmDeleteId && deals[confirmDeleteId]?.name) || "this deal"}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}
