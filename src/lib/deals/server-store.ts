import "server-only";
import { generateDeals, OWNERS } from "./generator";
import {
  Deal,
  DealMutableFields,
  DEFAULT_SIMULATION_CONFIG,
  PRIORITIES,
  SimulationConfig,
  STAGES,
} from "./types";

const DEAL_COUNT = 50_000;

/**
 * Module-level singleton. Node keeps the module cache warm across requests in a
 * single dev-server process, so this behaves like a real backing store for the
 * life of the process. It intentionally does NOT survive restarts or scale to
 * multiple server instances — see README for the production alternative
 * (a real DB with row versioning) this stands in for.
 */
declare global {
  var __dealsStore: Map<string, Deal> | undefined;
  var __simulationConfig: SimulationConfig | undefined;
}

function buildStore(): Map<string, Deal> {
  const deals = generateDeals(DEAL_COUNT);
  const map = new Map<string, Deal>();
  for (const deal of deals) map.set(deal.id, deal);
  return map;
}

export function getStore(): Map<string, Deal> {
  if (!global.__dealsStore) {
    global.__dealsStore = buildStore();
  }
  return global.__dealsStore;
}

export function getSimulationConfig(): SimulationConfig {
  if (!global.__simulationConfig) {
    global.__simulationConfig = { ...DEFAULT_SIMULATION_CONFIG };
  }
  return global.__simulationConfig;
}

export function setSimulationConfig(partial: Partial<SimulationConfig>): SimulationConfig {
  global.__simulationConfig = { ...getSimulationConfig(), ...partial };
  return global.__simulationConfig;
}

export function getDeal(id: string): Deal | undefined {
  return getStore().get(id);
}

export class ConflictError extends Error {
  current: Deal;
  constructor(current: Deal) {
    super("version_conflict");
    this.current = current;
  }
}

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`deal ${id} not found`);
  }
}

/**
 * Applies an update with optimistic concurrency control, and — driven by the
 * simulation config's conflictRate — randomly simulates "another user just
 * edited this record" immediately before the write lands, so the version
 * check genuinely fails sometimes without any other actor involved.
 */
export function applyUpdate(
  id: string,
  expectedVersion: number,
  changes: Partial<DealMutableFields>,
  injectConflict: boolean
): Deal {
  const store = getStore();
  const current = store.get(id);
  if (!current) throw new NotFoundError(id);

  let record = current;
  if (injectConflict) {
    // Simulate a concurrent writer landing a change a moment earlier.
    record = { ...current, version: current.version + 1, updatedAt: new Date().toISOString() };
    store.set(id, record);
  }

  if (record.version !== expectedVersion) {
    throw new ConflictError(record);
  }

  const updated: Deal = {
    ...record,
    ...changes,
    version: record.version + 1,
    updatedAt: new Date().toISOString(),
  };
  store.set(id, updated);
  return updated;
}

/**
 * Simulates the rest of the 20-person team working the same pipeline in the background,
 * independent of anything the current client does. Called on read paths (the list and
 * changes endpoints) so polling clients see other people's edits land without any action
 * of their own — this is what "stay up to date as teammates change deals" means here,
 * since there's no real backend/websocket to push from.
 */
export function maybeSimulateTeammateActivity(config: SimulationConfig): void {
  if (Math.random() >= config.teammateActivityRate) return;

  const store = getStore();
  const ids = Array.from(store.keys());
  if (!ids.length) return;

  const touches = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < touches; i++) {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const deal = store.get(id);
    if (!deal) continue;
    store.set(id, randomTeammateMutation(deal));
  }
}

function randomTeammateMutation(deal: Deal): Deal {
  const base = { ...deal, version: deal.version + 1, updatedAt: new Date().toISOString() };
  const pick = Math.random();

  const terminalIdx = STAGES.indexOf("won");
  if (pick < 0.3) {
    const idx = STAGES.indexOf(deal.stage);
    if (idx >= 0 && idx < terminalIdx) base.stage = STAGES[idx + 1];
  } else if (pick < 0.55) {
    base.value = Math.max(50_000, Math.round(deal.value * (0.9 + Math.random() * 0.3)));
  } else if (pick < 0.8) {
    base.priority = PRIORITIES[Math.floor(Math.random() * PRIORITIES.length)];
  } else {
    // Reassignment — a manager moving the deal to another rep, which is exactly the kind of
    // change that should show up as a real difference in the conflict dialog, not just stage.
    const others = OWNERS.filter((o) => o !== deal.owner);
    base.owner = others[Math.floor(Math.random() * others.length)];
  }
  return base;
}

/** Bulk path applies changes without a client-known version (last-write-wins per row, independent of conflict simulation). */
export function applyBulkUpdate(id: string, changes: Partial<DealMutableFields>): Deal {
  const store = getStore();
  const current = store.get(id);
  if (!current) throw new NotFoundError(id);
  const updated: Deal = {
    ...current,
    ...changes,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
  store.set(id, updated);
  return updated;
}

export function deleteDeal(id: string): void {
  const store = getStore();
  if (!store.has(id)) throw new NotFoundError(id);
  store.delete(id);
}
