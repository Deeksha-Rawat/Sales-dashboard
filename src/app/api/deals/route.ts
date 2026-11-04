import { NextRequest, NextResponse } from "next/server";
import { getStore, getSimulationConfig, maybeSimulateTeammateActivity } from "@/lib/deals/server-store";
import { simulateLatency } from "@/lib/deals/simulate";
import { Filters, matchesFilters } from "@/lib/deals/filters";
import { Deal, DealSummary, ListDealsResponse } from "@/lib/deals/types";

const PAGE_SIZE = 200;

function toSummary(deal: Deal): DealSummary {
  const { contactName: _contactName, contactEmail: _contactEmail, notes: _notes, ...summary } = deal;
  return summary;
}

export async function GET(req: NextRequest) {
  const config = getSimulationConfig();
  await simulateLatency(config);
  maybeSimulateTeammateActivity(config);

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
  const sortBy = (searchParams.get("sortBy") as keyof DealSummary) || "updatedAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const cursor = Math.max(0, Number(searchParams.get("cursor")) || 0);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || PAGE_SIZE));

  const store = getStore();
  const allOwners = new Set<string>();
  const matched: DealSummary[] = [];

  for (const deal of store.values()) {
    allOwners.add(deal.owner);
    if (!matchesFilters(deal, filters)) continue;
    matched.push(toSummary(deal));
  }

  matched.sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Only this page's rows are serialized — the rest of `matched` stays server-side. This is
  // what actually keeps the payload (and the client's state) small as the dataset scales to
  // 50k: the client never holds more than what it's scrolled through.
  const page = matched.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit;
  const hasMore = nextCursor < matched.length;

  const response: ListDealsResponse = {
    rows: page,
    total: matched.length,
    owners: Array.from(allOwners).sort(),
    serverTime: new Date().toISOString(),
    nextCursor: hasMore ? nextCursor : null,
    hasMore,
  };

  return NextResponse.json(response);
}
