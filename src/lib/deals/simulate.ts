import "server-only";
import { SimulationConfig } from "./types";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateLatency(config: SimulationConfig) {
  const { latencyMinMs, latencyMaxMs } = config;
  const ms = latencyMinMs + Math.random() * Math.max(0, latencyMaxMs - latencyMinMs);
  await sleep(ms);
}

export function shouldFail(config: SimulationConfig): boolean {
  return Math.random() < config.failureRate;
}

export function shouldConflict(config: SimulationConfig): boolean {
  return Math.random() < config.conflictRate;
}
