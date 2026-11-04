import { DealSummary, Priority, Stage } from "./types";

/** Shared by the server (list/changes routes) and the client store so both sides agree on what "matches the current view" means. */
export interface Filters {
  search: string;
  stage: Stage[];
  owner: string[];
  priority: Priority[];
  minValue?: number;
  maxValue?: number;
  /** false (default): the live pipeline, archived deals excluded. true: the archive view, ONLY archived deals. */
  archived: boolean;
}

export const EMPTY_FILTERS: Filters = { search: "", stage: [], owner: [], priority: [], archived: false };

export function matchesFilters(deal: DealSummary, filters: Filters): boolean {
  if (deal.archived !== filters.archived) return false;
  if (filters.stage.length && !filters.stage.includes(deal.stage)) return false;
  if (filters.owner.length && !filters.owner.includes(deal.owner)) return false;
  if (filters.priority.length && !filters.priority.includes(deal.priority)) return false;
  if (filters.minValue !== undefined && deal.value < filters.minValue) return false;
  if (filters.maxValue !== undefined && deal.value > filters.maxValue) return false;

  const search = filters.search.trim().toLowerCase();
  if (search) {
    const haystack = `${deal.name} ${deal.company} ${deal.owner}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}
