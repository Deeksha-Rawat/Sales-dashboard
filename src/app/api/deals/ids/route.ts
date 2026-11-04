import { NextRequest, NextResponse } from "next/server";
import { getStore, getSimulationConfig } from "@/lib/deals/server-store";
import { simulateLatency } from "@/lib/deals/simulate";
import { Filters, matchesFilters } from "@/lib/deals/filters";
import { DealIdsResponse } from "@/lib/deals/types";

/**
 * Id-only listing for "select all N matching the current filter" — with the main list
 * endpoint paginated, the client only ever holds the rows it's scrolled through, so bulk
 * selection across the *entire* filtered set (the "move thousands of deals to Lost" case)
 * needs its own cheap way to get every matching id without pulling full row data for each.
 */
export async function GET(req: NextRequest) {
  const config = getSimulationConfig();
  await simulateLatency(config);

  const { searchParams } = new URL(req.url);
  const filters: Filters = {
    search: searchParams.get("search")?.trim().toLowerCase() ?? "",
    stage: searchParams.getAll("stage") as Filters["stage"],
    owner: searchParams.getAll("owner"),
    priority: searchParams.getAll("priority") as Filters["priority"],
    minValue: searchParams.get("minValue") ? Number(searchParams.get("minValue")) : undefined,
    maxValue: searchParams.get("maxValue") ? Number(searchParams.get("maxValue")) : undefined,
    archived: searchParams.get("archived") === "true",
  };

  const store = getStore();
  const ids: string[] = [];
  for (const deal of store.values()) {
    if (matchesFilters(deal, filters)) ids.push(deal.id);
  }

  const response: DealIdsResponse = { ids, total: ids.length };
  return NextResponse.json(response);
}
