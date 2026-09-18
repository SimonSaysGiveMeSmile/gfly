"use client";

/**
 * A small live brain beside each fly at the table. Each one is a real copy
 * of the connectome running in its own worker (the lighter 2.7M-edge tier),
 * so three seats cost three threads. The moves are still the scripted
 * strategy; the brains are not wired to the game yet, and the label says so.
 */
import { useEffect, useMemo, useState } from "react";
import { BrainView } from "../baseline-room/BrainView";
import { FrameBus } from "../baseline-room/bus";
import type { FromWorker, ToWorker } from "../baseline-room/protocol";
import { TIERS, useTier } from "@/lib/sim/tier";

const SEATS: { seat: number; className: string }[] = [
  { seat: 1, className: "right-3 top-[34%]" },
  { seat: 2, className: "left-[57%] top-3" },
  { seat: 3, className: "left-3 top-[34%]" },
];

export function FlyBrains({ names, active, enabled }: { names: string[]; active: number | null; enabled: boolean }) {
  const buses = useMemo(() => SEATS.map(() => new FrameBus()), []);
  const tier = useTier();
  const [state, setState] = useState<Record<number, { hz: number; ready: boolean }>>({});

  useEffect(() => {
    if (!enabled) return;
    const workers = SEATS.map(({ seat }, i) => {
      const w = new Worker(new URL("../baseline-room/worker.ts", import.meta.url));
      let lastSlow = 0;
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === "ready") {
          buses[i].ready = m;
          setState((s) => ({ ...s, [seat]: { hz: 0, ready: true } }));
          w.postMessage({ type: "run", running: true } satisfies ToWorker);
        } else if (m.type === "telemetry") {
          buses[i].push(m);
          const now = performance.now();
          if (now - lastSlow > 500) { lastSlow = now; setState((s) => ({ ...s, [seat]: { hz: m.data.meanHz, ready: true } })); }
        }
      };
      w.postMessage({ type: "load", tier } satisfies ToWorker);
      return w;
    });
    return () => { workers.forEach((w) => w.terminate()); setState({}); };
  }, [enabled, buses, tier]);

  if (!enabled) return null;
  return (
    <>
      {SEATS.map(({ seat, className }, i) => {
        const st = state[seat];
        return (
          <div key={seat} className={`pointer-events-none absolute ${className} w-[9.5rem]`}>
            <div className="flex items-baseline justify-between px-1">
              <span className={`t-cap ${active === seat ? "text-label" : ""}`}>{names[seat]}</span>
              <span className="t-cap num">{st?.ready ? `${st.hz.toFixed(0)} Hz` : "loading"}</span>
            </div>
            <BrainView bus={buses[i]} className="glass-inner mt-0.5 aspect-square w-full" />
          </div>
        );
      })}
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 t-cap whitespace-nowrap">
        Three live copies of the {TIERS.find((t) => t.tier === tier)!.label.toLowerCase()} brain. Not wired to the moves yet.
      </p>
    </>
  );
}
