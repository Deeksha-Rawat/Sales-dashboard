"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDealsStore } from "@/store/deals-store";
import { PRIORITIES, PRIORITY_LABELS, STAGES, STAGE_LABELS, Priority, Stage } from "@/lib/deals/types";
import { Input, Badge, Button, Option, Select } from "@/components/ui/primitives";
import { Archive, RefreshCw, SlidersHorizontal, Users, X } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function DealsToolbar() {
  const filters = useDealsStore((s) => s.filters);
  const setFilters = useDealsStore((s) => s.setFilters);
  const owners = useDealsStore((s) => s.owners);
  const total = useDealsStore((s) => s.total);
  const backgroundSync = useDealsStore((s) => s.backgroundSync);
  // Deliberately NOT `syncing` — that also flips on while the 5s auto-poll is running, which
  // would make this button look like it's "always refreshing" on its own. It should only
  // reflect a sync the user asked for by clicking it.
  const manualSyncing = useDealsStore((s) => s.manualSyncing);
  const lastRefreshedAt = useDealsStore((s) => s.lastRefreshedAt);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      if (searchDraft !== filters.search) setFilters({ search: searchDraft });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
  }

  // Portal the panel out to document.body (fixed position) rather than rendering it as a
  // descendant of this toolbar: the toolbar uses `backdrop-blur`, and an absolutely-positioned
  // child that visually extends past the blurred container's bounds hits a real compositing
  // bug in Chromium/WebKit — the table content underneath bleeds through the panel. Portaling
  // (same approach as the Select/Menu primitives) sidesteps it entirely.
  useIsomorphicLayoutEffect(() => {
    if (!filtersOpen) return;
    updatePosition();
  }, [filtersOpen]);

  useEffect(() => {
    if (!filtersOpen) return;
    const reposition = () => updatePosition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setFiltersOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  function toggleStage(stage: Stage) {
    const next = filters.stage.includes(stage)
      ? filters.stage.filter((s) => s !== stage)
      : [...filters.stage, stage];
    setFilters({ stage: next });
  }

  function togglePriority(priority: Priority) {
    const next = filters.priority.includes(priority)
      ? filters.priority.filter((p) => p !== priority)
      : [...filters.priority, priority];
    setFilters({ priority: next });
  }

  function removeOwner(owner: string) {
    setFilters({ owner: filters.owner.filter((o) => o !== owner) });
  }

  const activeCount = filters.stage.length + filters.priority.length + (filters.archived ? 1 : 0);
  const hasActiveFilters = activeCount > 0 || filters.owner.length > 0 || !!filters.search;

  function clearAll() {
    setSearchDraft("");
    setFilters({ search: "", stage: [], priority: [], owner: [], archived: false });
  }

  return (
    <div className="flex flex-col gap-2.5 border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search deals, companies, owners…"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          className="max-w-xs"
          aria-label="Search deals"
        />

        <Select
          value={filters.owner[0] ?? ""}
          onChange={(v) => setFilters({ owner: v ? [v] : [] })}
          aria-label="Filter by owner"
          className="min-w-[9.5rem]"
        >
          <Option value="">All owners</Option>
          {owners.map((o) => (
            <Option key={o} value={o}>
              {o}
            </Option>
          ))}
        </Select>

        <Button
          ref={triggerRef}
          variant={activeCount > 0 ? "primary" : "secondary"}
          size="md"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-haspopup="dialog"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/25 px-1 text-[11px] font-semibold">
              {activeCount}
            </span>
          )}
        </Button>

        <Button
          variant="secondary"
          size="md"
          onClick={() => void backgroundSync({ manual: true })}
          disabled={manualSyncing}
          aria-label="Refresh — pull in any changes teammates made since your last sync, without waiting for the next automatic sync"
          title="Refresh now (updates also sync automatically every 5s)"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", manualSyncing && "animate-spin")} />
          {manualSyncing ? "Refreshing…" : "Refresh"}
        </Button>

        {filtersOpen &&
          pos &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Filter deals"
              style={{ position: "fixed", top: pos.top, left: pos.left }}
              className="z-40 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
            >
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Stage</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleStage(s)}
                      className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      <Badge tone={filters.stage.includes(s) ? "blue" : "gray"}>{STAGE_LABELS[s]}</Badge>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Priority</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePriority(p)}
                      className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      <Badge tone={filters.priority.includes(p) ? "purple" : "gray"}>{PRIORITY_LABELS[p]}</Badge>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 border-t border-gray-100 pt-3">
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Archive className="h-3.5 w-3.5 text-gray-400" /> Show archived deals
                  </span>
                  <input
                    type="checkbox"
                    checked={filters.archived}
                    onChange={(e) => setFilters({ archived: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                  />
                </label>
                <p className="mt-1 text-xs text-gray-400">
                  {filters.archived ? "Showing only archived deals." : "Archived deals are hidden from the pipeline."}
                </p>
              </div>
            </div>,
            document.body
          )}
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.stage.map((s) => (
            <Tag key={`stage-${s}`} label={STAGE_LABELS[s]} onRemove={() => toggleStage(s)} />
          ))}
          {filters.priority.map((p) => (
            <Tag key={`priority-${p}`} label={PRIORITY_LABELS[p]} onRemove={() => togglePriority(p)} />
          ))}
          {filters.owner.map((o) => (
            <Tag key={`owner-${o}`} label={o} onRemove={() => removeOwner(o)} />
          ))}
          {filters.archived && <Tag label="Archived" onRemove={() => setFilters({ archived: false })} />}
          {filters.search && <Tag label={`"${filters.search}"`} onRemove={() => setSearchDraft("")} />}
          <button onClick={clearAll} className="text-xs font-medium text-blue-600 hover:underline">
            Clear all
          </button>
        </div>
      )}

      <span className="flex items-center gap-1 text-xs text-gray-500">
        <Users className="h-3.5 w-3.5" /> {total.toLocaleString()} deals
        {lastRefreshedAt && (
          <span className="text-gray-400">· last refreshed {formatRelativeTime(lastRefreshedAt)}</span>
        )}
      </span>
    </div>
  );
}

function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-blue-700">
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded-full p-0.5 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
