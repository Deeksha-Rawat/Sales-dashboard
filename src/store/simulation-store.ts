import { create } from "zustand";
import { fetchSimulationConfig, updateSimulationConfig } from "@/lib/deals/api-client";
import { DEFAULT_SIMULATION_CONFIG, SimulationConfig } from "@/lib/deals/types";

interface SimulationState extends SimulationConfig {
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<SimulationConfig>) => Promise<void>;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  ...DEFAULT_SIMULATION_CONFIG,
  loaded: false,

  load: async () => {
    const config = await fetchSimulationConfig();
    set({ ...config, loaded: true });
  },

  update: async (partial) => {
    set(partial);
    const config = await updateSimulationConfig(partial);
    set(config);
    void get();
  },
}));
