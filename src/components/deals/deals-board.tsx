"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PRIORITY_LABELS, STAGES, STAGE_LABELS, Stage } from "@/lib/deals/types";
import { useDealsStore } from "@/store/deals-store";
import { Menu, Option, Select, type MenuItem } from "@/components/ui/primitives";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { CompanyAvatar } from "./company-avatar";
import { RowStatusIndicator } from "./row-status";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import {
  Archive,
  CheckSquare,
  Eye,
  Loader2,
  MoreHorizontal,
  SquarePen,
  Trash2,
  Wallet,
} from "lucide-react";

const LOAD_MORE_THRESHOLD = 10;
const CARD_HEIGHT = 136;
const estimateCardSize = () => CARD_HEIGHT;

const STAGE_ACCENT: Record<Stage, string> = {
  new_lead: "bg-gray-300",
  contacted: "bg-sky-400",
  demo_done: "bg-blue-400",
  proposal_sent: "bg-purple-400",
  negotiation: "bg-amber-400",
  won: "bg-green-400",
  lost: "bg-red-400",
};

const PRIORITY_TONE: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-rose-100 text-rose-700",
};

/**
 * Board groups the currently loaded (filtered) rows by stage. Cards move
 * between stages via a keyboard-accessible "Move to" select rather than
 * drag-and-drop, which is both simpler to keep correct against the same
 * optimistic-save pipeline as the table and more accessible by default.
 */
export function DealsBoard({ onOpenDetail }: { onOpenDetail: (id: string) => void }) {
  const order = useDealsStore((s) => s.order);
  const deals = useDealsStore((s) => s.deals);
  const pending = useDealsStore((s) => s.pending);
  const recentlyUpdated = useDealsStore((s) => s.recentlyUpdated);
  const updateDeal = useDealsStore((s) => s.updateDeal);
  const selectIds = useDealsStore((s) => s.selectIds);
  const hasMore = useDealsStore((s) => s.hasMore);
  const loadingMore = useDealsStore((s) => s.loadingMore);
  const loadMoreDeals = useDealsStore((s) => s.loadMoreDeals);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s, [] as string[]])) as Record<Stage, string[]>;
    for (const id of order) {
      const deal = deals[id];
      if (deal) map[deal.stage].push(id);
    }
    return map;
  }, [order, deals]);

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => (
          <BoardColumn
            key={stage}
            stage={stage}
            ids={byStage[stage]}
            onOpenDetail={onOpenDetail}
            onMoveStage={(id, next) => updateDeal(id, { stage: next }, { undoLabel: "stage change" })}
            onSelectAll={() => selectIds(byStage[stage])}
            onArchive={(id, archived) => updateDeal(id, { archived }, { undoLabel: archived ? "archive" : "unarchive" })}
            onDeleteRequest={setConfirmDeleteId}
            pending={pending}
            deals={deals}
            recentlyUpdated={recentlyUpdated}
            hasMore={hasMore}
            loadingMore={loadingMore}
            loadMoreDeals={loadMoreDeals}
          />
        ))}
      </div>
      {loadingMore && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading more deals…
        </div>
      )}

      <DeleteConfirmDialog
        dealId={confirmDeleteId}
        dealName={(confirmDeleteId && deals[confirmDeleteId]?.name) || "this deal"}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

function BoardColumn({
  stage,
  ids,
  onOpenDetail,
  onMoveStage,
  onSelectAll,
  onArchive,
  onDeleteRequest,
  pending,
  deals,
  recentlyUpdated,
  hasMore,
  loadingMore,
  loadMoreDeals,
}: {
  stage: Stage;
  ids: string[];
  onOpenDetail: (id: string) => void;
  onMoveStage: (id: string, stage: Stage) => void;
  onSelectAll: () => void;
  onArchive: (id: string, archived: boolean) => void;
  onDeleteRequest: (id: string) => void;
  pending: ReturnType<typeof useDealsStore.getState>["pending"];
  deals: ReturnType<typeof useDealsStore.getState>["deals"];
  recentlyUpdated: ReturnType<typeof useDealsStore.getState>["recentlyUpdated"];
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreDeals: () => Promise<void>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => parentRef.current, []);
  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement,
    estimateSize: estimateCardSize,
    overscan: 8,
  });

  // Loading more appends the next page across every stage, not just this column, so any
  // column nearing the end of its own loaded cards is a reasonable trigger — the store's
  // own in-flight guard de-dupes if several columns hit bottom around the same time.
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : -1;
  useEffect(() => {
    if (hasMore && !loadingMore && lastIndex >= ids.length - LOAD_MORE_THRESHOLD) {
      void loadMoreDeals();
    }
  }, [lastIndex, hasMore, loadingMore, ids.length, loadMoreDeals]);

  const totalValue = ids.reduce((sum, id) => sum + (deals[id]?.value ?? 0), 0);

  const menuItems: MenuItem[] = [
    {
      label: `Select all ${ids.length} loaded`,
      icon: <CheckSquare className="h-3.5 w-3.5" />,
      onClick: onSelectAll,
    },
  ];

  return (
    <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50/70 shadow-sm">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-4 w-1 rounded-full", STAGE_ACCENT[stage])} />
          <h3 className="text-sm font-semibold text-gray-900">{STAGE_LABELS[stage]}</h3>
          <span className="rounded-full bg-gray-200/70 px-1.5 py-0.5 text-xs font-medium text-gray-600">
            {ids.length}
          </span>
        </div>
        <Menu items={menuItems} aria-label={`${STAGE_LABELS[stage]} column actions`} trigger={<MoreHorizontal className="h-4 w-4" />} />
      </div>
      <div className="px-3 pb-2 text-xs text-gray-400">{formatCurrency(totalValue)} total</div>

      <div ref={parentRef} className="h-[62vh] overflow-y-auto px-2">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualItems.map((vRow) => {
            const id = ids[vRow.index];
            const deal = deals[id];
            if (!deal) return null;
            const status = pending[id]?.status ?? "idle";
            const isRecentlyUpdated = recentlyUpdated.has(id);
            return (
              <div
                key={id}
                ref={virtualizer.measureElement}
                data-index={vRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vRow.start}px)`,
                  paddingBottom: 10,
                }}
              >
                <div
                  className={cn(
                    "rounded-lg border border-gray-100 bg-white p-3 shadow-sm transition-shadow hover:shadow-md",
                    status === "conflict" && "border-amber-400 ring-1 ring-amber-200",
                    status === "failed" && "border-red-400 ring-1 ring-red-200",
                    isRecentlyUpdated && "row-flash"
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="truncate text-xs text-gray-400">Owner: {deal.owner}</span>
                    <span className="flex items-center gap-0.5">
                      <button
                        onClick={() => onOpenDetail(id)}
                        className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                        aria-label={`Edit ${deal.name}`}
                        title="Edit"
                      >
                        <SquarePen className="h-3.5 w-3.5" />
                      </button>
                      <Menu
                        aria-label={`More actions for ${deal.name}`}
                        trigger={<MoreHorizontal className="h-3.5 w-3.5" />}
                        items={[
                          { label: "View details", icon: <Eye className="h-3.5 w-3.5" />, onClick: () => onOpenDetail(id) },
                          {
                            label: deal.archived ? "Unarchive" : "Archive",
                            icon: <Archive className="h-3.5 w-3.5" />,
                            onClick: () => onArchive(id, !deal.archived),
                          },
                          {
                            label: "Delete",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            danger: true,
                            onClick: () => onDeleteRequest(id),
                          },
                        ]}
                      />
                      <RowStatusIndicator status={status} />
                    </span>
                  </div>

                  <button
                    onClick={() => onOpenDetail(id)}
                    className="block w-full truncate text-left text-sm font-semibold text-gray-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    title={deal.name}
                  >
                    {deal.name}
                  </button>

                  <div className="mt-2 flex items-center gap-1.5">
                    <CompanyAvatar name={deal.company} />
                    <span className="truncate text-xs text-gray-500">{deal.company}</span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        PRIORITY_TONE[deal.priority]
                      )}
                    >
                      {PRIORITY_LABELS[deal.priority]}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1 font-medium text-gray-600">
                      <Wallet className="h-3 w-3" /> {formatCurrency(deal.value)}
                    </span>
                    <span>{formatRelativeTime(deal.updatedAt)}</span>
                  </div>

                  <Select
                    size="sm"
                    value={deal.stage}
                    disabled={status === "saving"}
                    onChange={(v) => onMoveStage(id, v as Stage)}
                    className="mt-2 w-full"
                    aria-label={`Move ${deal.name} to stage`}
                  >
                    {STAGES.map((s) => (
                      <Option key={s} value={s}>
                        Move to {STAGE_LABELS[s]}
                      </Option>
                    ))}
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
