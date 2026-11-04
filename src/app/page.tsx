"use client";

import { useEffect, useState } from "react";
import { useDealsStore } from "@/store/deals-store";
import { DealsToolbar } from "@/components/deals/deals-toolbar";
import { DealsTable } from "@/components/deals/deals-table";
import { BulkActionBar } from "@/components/deals/bulk-action-bar";
import { ConflictDialog } from "@/components/deals/conflict-dialog";
import { SimulationPanel } from "@/components/deals/simulation-panel";
import { DealDetailDrawer } from "@/components/deals/deal-detail-drawer";
import { TableSkeleton } from "@/components/deals/table-skeleton";
import { AddLeadDialog } from "@/components/deals/add-lead-dialog";
import { useAuthStore } from "@/store/auth-store";
import { LoginScreen } from "@/components/auth/login-screen";
import { UserMenu } from "@/components/auth/user-menu";
import { Plus, Workflow } from "lucide-react";

export default function Home() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<"view" | "edit">("view");
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const loadDeals = useDealsStore((s) => s.loadDeals);
  const backgroundSync = useDealsStore((s) => s.backgroundSync);
  const loading = useDealsStore((s) => s.loading);
  const loadError = useDealsStore((s) => s.loadError);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) loadDeals();
  }, [user, loadDeals]);

  // Automatic background sync every 5s, paused while the tab isn't visible so it doesn't
  // burn requests on a backgrounded tab — on top of (not instead of) the toolbar's manual
  // Refresh button, which calls the same `backgroundSync` on demand.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void backgroundSync();
    }, 5000);
    return () => clearInterval(id);
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

      <DealsToolbar />

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
          <TableSkeleton />
        ) : (
          <DealsTable
            onOpenDetail={(id, mode) => {
              setDetailId(id);
              setDetailMode(mode);
            }}
          />
        )}
      </main>

      <BulkActionBar />
      <ConflictDialog />
      <SimulationPanel />
      <DealDetailDrawer id={detailId} mode={detailMode} onClose={() => setDetailId(null)} />

      <button
        onClick={() => setAddLeadOpen(true)}
        className="fixed bottom-20 right-4 z-20 flex h-11 items-center gap-1.5 rounded-full bg-blue-600 pl-3.5 pr-4 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        aria-label="Add a new lead"
      >
        <Plus className="h-4.5 w-4.5" /> Add lead
      </button>
      <AddLeadDialog open={addLeadOpen} onClose={() => setAddLeadOpen(false)} />
    </div>
  );
}
