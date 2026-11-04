import { NextRequest, NextResponse } from "next/server";
import { getSimulationConfig, setSimulationConfig } from "@/lib/deals/server-store";

export async function GET() {
  return NextResponse.json(getSimulationConfig());
}

export async function POST(req: NextRequest) {
  const partial = await req.json();
  const updated = setSimulationConfig(partial);
  return NextResponse.json(updated);
}
