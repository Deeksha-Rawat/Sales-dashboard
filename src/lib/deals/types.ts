export const STAGES = [
  "new_lead",
  "contacted",
  "demo_done",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
] as const;
export type Stage = (typeof STAGES)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  demo_done: "Demo Done",
  proposal_sent: "Proposal Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Lightweight shape returned by the list endpoint (keeps the 50k-row payload small). */
export interface DealSummary {
  id: string;
  name: string;
  company: string;
  owner: string;
  value: number;
  stage: Stage;
  priority: Priority;
  closeDate: string; // ISO date
  updatedAt: string; // ISO datetime
  version: number;
  archived: boolean;
}

/** Full record, including fields only needed in the detail drawer. */
export interface Deal extends DealSummary {
  contactName: string;
  contactEmail: string;
  notes: string;
}

export type DealMutableFields = Pick<
  Deal,
  "name" | "company" | "owner" | "value" | "stage" | "priority" | "closeDate" | "notes" | "archived"
>;

export interface SimulationConfig {
  latencyMinMs: number;
  latencyMaxMs: number;
  failureRate: number; // 0..1
  conflictRate: number; // 0..1
  teammateActivityRate: number; // 0..1, chance per request that other "teammates" touch a few random deals
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  latencyMinMs: 150,
  latencyMaxMs: 500,
  failureRate: 0.1,
  conflictRate: 0.1,
  teammateActivityRate: 0.4,
};

export interface ConflictResponse {
  error: "conflict";
  current: Deal;
}

export interface ListDealsParams {
  search?: string;
  stage?: Stage[];
  owner?: string[];
  priority?: Priority[];
  minValue?: number;
  maxValue?: number;
  archived?: boolean;
  sortBy?: keyof DealSummary;
  sortDir?: "asc" | "desc";
  cursor?: number;
  limit?: number;
}

export interface ListDealsResponse {
  rows: DealSummary[];
  total: number;
  owners: string[];
  serverTime: string;
  nextCursor: number | null;
  hasMore: boolean;
}

export interface DealChangesResponse {
  changed: DealSummary[];
  serverTime: string;
}

export interface DealIdsParams {
  search?: string;
  stage?: Stage[];
  owner?: string[];
  priority?: Priority[];
  minValue?: number;
  maxValue?: number;
  archived?: boolean;
}

export interface DealIdsResponse {
  ids: string[];
  total: number;
}

export interface BulkUpdateRequest {
  ids: string[];
  changes: Partial<DealMutableFields>;
}

export interface BulkUpdateResult {
  id: string;
  success: boolean;
  error?: string;
  record?: Deal;
}

export interface BulkUpdateResponse {
  results: BulkUpdateResult[];
}
