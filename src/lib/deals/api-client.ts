import {
  BulkUpdateResponse,
  Deal,
  DealChangesResponse,
  DealIdsParams,
  DealIdsResponse,
  DealMutableFields,
  ListDealsParams,
  ListDealsResponse,
  SimulationConfig,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class ConflictApiError extends ApiError {
  current: Deal;
  constructor(current: Deal) {
    super(409, "conflict");
    this.current = current;
  }
}

function buildFilterQuery(params: DealIdsParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  params.stage?.forEach((s) => sp.append("stage", s));
  params.owner?.forEach((o) => sp.append("owner", o));
  params.priority?.forEach((p) => sp.append("priority", p));
  if (params.minValue !== undefined) sp.set("minValue", String(params.minValue));
  if (params.maxValue !== undefined) sp.set("maxValue", String(params.maxValue));
  if (params.archived) sp.set("archived", "true");
  return sp;
}

function buildQuery(params: ListDealsParams): string {
  const sp = buildFilterQuery(params);
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  if (params.cursor !== undefined) sp.set("cursor", String(params.cursor));
  if (params.limit !== undefined) sp.set("limit", String(params.limit));
  return sp.toString();
}

export async function fetchDeals(params: ListDealsParams): Promise<ListDealsResponse> {
  const res = await fetch(`/api/deals?${buildQuery(params)}`);
  if (!res.ok) throw new ApiError(res.status, "failed to load deals");
  return res.json();
}

export async function fetchDealIds(params: DealIdsParams): Promise<DealIdsResponse> {
  const res = await fetch(`/api/deals/ids?${buildFilterQuery(params).toString()}`);
  if (!res.ok) throw new ApiError(res.status, "failed to load matching deal ids");
  return res.json();
}

export async function fetchDealChanges(since: string): Promise<DealChangesResponse> {
  const res = await fetch(`/api/deals/changes?since=${encodeURIComponent(since)}`);
  if (!res.ok) throw new ApiError(res.status, "failed to load deal changes");
  return res.json();
}

export async function fetchDealDetail(id: string): Promise<Deal> {
  const res = await fetch(`/api/deals/${id}`);
  if (!res.ok) throw new ApiError(res.status, "failed to load deal");
  return res.json();
}

export async function patchDeal(
  id: string,
  version: number,
  changes: Partial<DealMutableFields>
): Promise<Deal> {
  const res = await fetch(`/api/deals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, changes }),
  });

  if (res.status === 409) {
    const body = await res.json();
    throw new ConflictApiError(body.current as Deal);
  }
  if (!res.ok) throw new ApiError(res.status, "save failed");
  return res.json();
}

export async function deleteDeal(id: string): Promise<void> {
  const res = await fetch(`/api/deals/${id}`, { method: "DELETE" });
  if (!res.ok) throw new ApiError(res.status, "delete failed");
}

export async function bulkUpdateDeals(
  ids: string[],
  changes: Partial<DealMutableFields>
): Promise<BulkUpdateResponse> {
  const res = await fetch("/api/deals/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, changes }),
  });
  if (!res.ok) throw new ApiError(res.status, "bulk update failed");
  return res.json();
}

export async function fetchSimulationConfig(): Promise<SimulationConfig> {
  const res = await fetch("/api/simulation");
  if (!res.ok) throw new ApiError(res.status, "failed to load simulation config");
  return res.json();
}

export async function updateSimulationConfig(
  partial: Partial<SimulationConfig>
): Promise<SimulationConfig> {
  const res = await fetch("/api/simulation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  if (!res.ok) throw new ApiError(res.status, "failed to update simulation config");
  return res.json();
}
