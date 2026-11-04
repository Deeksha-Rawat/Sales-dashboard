import { NextRequest, NextResponse } from "next/server";
import { getStore, getSimulationConfig, maybeSimulateTeammateActivity } from "@/lib/deals/server-store";
import { simulateLatency } from "@/lib/deals/simulate";
import { Deal, DealChangesResponse, DealSummary } from "@/lib/deals/types";

const MAX_CHANGES = 500;

function toSummary(deal: Deal): DealSummary {
  const { contactName: _contactName, contactEmail: _contactEmail, notes: _notes, ...summary } = deal;
  return summary;
}

/**
 * Lightweight diff endpoint: returns only deals touched since `since`, so a client can
 * poll for "what did teammates change while I wasn't looking" without re-fetching the
 * full (potentially 50k-row) list on every tick.
 */
export async function GET(req: NextRequest) {
  const config = getSimulationConfig();
  await simulateLatency(config);
  maybeSimulateTeammateActivity(config);

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");
  const sinceMs = since ? Date.parse(since) : 0;

  const store = getStore();
  const changed: DealSummary[] = [];
  for (const deal of store.values()) {
    if (Date.parse(deal.updatedAt) > sinceMs) changed.push(toSummary(deal));
  }
  changed.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  const response: DealChangesResponse = {
    changed: changed.slice(0, MAX_CHANGES),
    serverTime: new Date().toISOString(),
  };
  return NextResponse.json(response);
}
