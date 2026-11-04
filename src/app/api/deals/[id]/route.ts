import { NextRequest, NextResponse } from "next/server";
import {
  applyUpdate,
  ConflictError,
  deleteDeal,
  getDeal,
  getSimulationConfig,
  NotFoundError,
} from "@/lib/deals/server-store";
import { shouldFail, shouldConflict, simulateLatency } from "@/lib/deals/simulate";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await simulateLatency(getSimulationConfig());
  const deal = getDeal(id);
  if (!deal) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(deal);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = getSimulationConfig();
  await simulateLatency(config);

  const body = await req.json();
  const { version, changes } = body as { version: number; changes: Record<string, unknown> };

  if (typeof version !== "number" || !changes) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (shouldFail(config)) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  try {
    const updated = applyUpdate(id, version, changes, shouldConflict(config));
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: "conflict", current: err.current }, { status: 409 });
    }
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = getSimulationConfig();
  await simulateLatency(config);

  if (shouldFail(config)) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  try {
    deleteDeal(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
