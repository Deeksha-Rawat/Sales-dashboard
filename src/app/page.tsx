"use client";

import { useEffect, useState } from "react";
import { useDealsStore } from "@/store/deals-store";
import { DealsToolbar } from "@/components/deals/deals-toolbar";
import { DealsTable } from "@/components/deals/deals-table";
import { DealsBoard } from "@/components/deals/deals-board";
import { BulkActionBar } from "@/components/deals/bulk-action-bar";
import { ConflictDialog } from "@/components/deals/conflict-dialog";
import { SimulationPanel } from "@/components/deals/simulation-panel";
import { DealDetailDrawer } from "@/components/deals/deal-detail-drawer";
import { TableSkeleton } from "@/components/deals/table-skeleton";
import { BoardSkeleton } from "@/components/deals/board-skeleton";
import { useAuthStore } from "@/store/auth-store";
import { LoginScreen } from "@/components/auth/login-screen";
import { UserMenu } from "@/components/auth/user-menu";
import { Workflow } from "lucide-react";

export default function Home() {
  const [view, setView] = useState<"table" | "board">("table");
  const [detailId, setDetailId] = useState<string | null>(null);
  const loadDeals = useDealsStore((s) => s.loadDeals);
  const backgroundSync = useDealsStore((s) => s.backgroundSync);
  const loading = useDealsStore((s) => s.loading);
  const loadError = useDealsStore((s) => s.loadError);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) loadDeals();
  }, [user, loadDeals]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void backgroundSync();
    }, 4000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void backgroundSync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, backgroundSync]);

  if (!user) return <LoginScreen />;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Workflow className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight text-gray-900">Sales Pipeline</h1>
            <p className="text-xs text-gray-500">Track deals from lead to close</p>
          </div>
        </div>
        <UserMenu />
      </header>

      <DealsToolbar view={view} onViewChange={setView} />

      <main className="flex flex-1 flex-col gap-3 px-4 py-3">
        {loadError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Failed to load deals: {loadError}.{" "}
            <button className="font-medium underline" onClick={() => loadDeals()}>
              Retry
            </button>
          </div>
        )}
        {loading ? (
          view === "table" ? (
            <TableSkeleton />
          ) : (
            <BoardSkeleton />
          )
        ) : view === "table" ? (
          <DealsTable onOpenDetail={setDetailId} />
        ) : (
          <DealsBoard onOpenDetail={setDetailId} />
        )}
      </main>

      <BulkActionBar />
      <ConflictDialog />
      <SimulationPanel />
      <DealDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
