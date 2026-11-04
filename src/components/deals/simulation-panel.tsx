"use client";

import { useEffect, useState } from "react";
import { useSimulationStore } from "@/store/simulation-store";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SimulationPanel() {
  const [open, setOpen] = useState(false);
  const { latencyMinMs, latencyMaxMs, failureRate, conflictRate, teammateActivityRate, loaded, load, update } =
    useSimulationStore();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  return (
    <div className="fixed bottom-4 right-4 z-20">
      {open && (
        <div className="mb-2 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
          <h3 className="mb-3 text-sm font-semibold">Simulation controls</h3>
          <SliderRow
            label={`Latency: ${latencyMinMs}–${latencyMaxMs}ms`}
            min={0}
            max={2000}
            value={latencyMaxMs}
            onChange={(v) => update({ latencyMaxMs: v, latencyMinMs: Math.min(latencyMinMs, v) })}
          />
          <SliderRow
            label={`Failure rate: ${Math.round(failureRate * 100)}%`}
            min={0}
            max={100}
            value={Math.round(failureRate * 100)}
            onChange={(v) => update({ failureRate: v / 100 })}
          />
          <SliderRow
            label={`Conflict rate: ${Math.round(conflictRate * 100)}%`}
            min={0}
            max={100}
            value={Math.round(conflictRate * 100)}
            onChange={(v) => update({ conflictRate: v / 100 })}
          />
          <SliderRow
            label={`Teammate activity: ${Math.round(teammateActivityRate * 100)}%`}
            min={0}
            max={100}
            value={Math.round(teammateActivityRate * 100)}
            onChange={(v) => update({ teammateActivityRate: v / 100 })}
          />
          <p className="mt-2 text-xs text-gray-400">
            Latency/failure/conflict apply to every save and bulk operation — try 0% to see the happy path, or crank
            them up to exercise retry and conflict-resolution flows. Teammate activity drives other &quot;users&quot;
            editing random deals in the background; watch rows update and flash on their own every few seconds.
          </p>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Toggle simulation controls"
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600",
          open ? "bg-gray-900 text-white" : "bg-white text-gray-700 border border-gray-200"
        )}
      >
        <Settings2 className="h-5 w-5" />
      </button>
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-2 block text-xs text-gray-600">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}
