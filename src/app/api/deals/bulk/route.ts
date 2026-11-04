import { NextRequest, NextResponse } from "next/server";
import { applyBulkUpdate, getSimulationConfig, NotFoundError } from "@/lib/deals/server-store";
import { shouldFail, simulateLatency } from "@/lib/deals/simulate";
import { BulkUpdateRequest, BulkUpdateResponse, BulkUpdateResult } from "@/lib/deals/types";

/**
 * Applies a bulk change to a chunk of ids. Each row is evaluated for failure
 * independently so a bulk op can partially succeed — the client is expected
 * to call this once per chunk (see useBulkMutation) rather than send all
 * selected ids in a single request, to keep progress feedback granular and
 * avoid one giant blocking request.
 */
export async function POST(req: NextRequest) {
  const config = getSimulationConfig();
  await simulateLatency(config);

  const body = (await req.json()) as BulkUpdateRequest;
  const { ids, changes } = body;

  if (!Array.isArray(ids) || !changes) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const results: BulkUpdateResult[] = ids.map((id) => {
    if (shouldFail(config)) {
      return { id, success: false, error: "server_error" };
    }
    try {
      const record = applyBulkUpdate(id, changes);
      return { id, success: true, record };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { id, success: false, error: "not_found" };
      }
      return { id, success: false, error: "server_error" };
    }
  });

  const response: BulkUpdateResponse = { results };
  return NextResponse.json(response);
}
