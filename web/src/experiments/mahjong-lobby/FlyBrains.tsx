"use client";

/**
 * A live brain beside each fly at the table, and the wire between that
 * brain and the game. Each seat runs its own copy of the connectome in a
 * worker. When it is that fly's turn, the table shows its eyes each
 * candidate tile and reads the mushroom body's verdict: cholinergic output
 * neurons mean approach, glutamatergic ones mean avoid. Wins and losses
 * become dopamine lessons that change that brain's synapses.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BrainView } from "../baseline-room/BrainView";
import { FrameBus } from "../baseline-room/bus";
import type { FromWorker, ToWorker } from "../baseline-room/protocol";
import { TIERS, useTier } from "@/lib/sim/tier";
import { KIND_LABELS } from "./engine";

const SEATS: { seat: number; className: string }[] = [
  { seat: 1, className: "right-3 top-[34%]" },
  { seat: 2, className: "left-[57%] top-3" },
  { seat: 3, className: "left-3 top-[34%]" },
];

export interface Verdict { code: number; approach: number; avoid: number; kc: number }

export interface BrainsApi {
  /** Whether this seat has a brain running and ready. */
  ready(seat: number): boolean;
  /** Show a tile to the fly for `ms` of simulated time and read its verdict. */
  look(seat: number, code: number, ms?: number): Promise<Verdict>;
  /** A dopamine lesson about a tile: +1 reward, -1 punishment. Resolves with synapses changed. */
  teach(seat: number, code: number, reward: 1 | -1, ms?: number): Promise<number>;
}

type SeatState = { ready: boolean; hz: number; note: string; lessons: number; synapses: number };

export function FlyBrains({ names, active, enabled, onApi }: {
  names: string[];
  active: number | null;
  enabled: boolean;
  /** Called with the wire to the brains once they exist, and with null when they go. */
  onApi: (api: BrainsApi | null) => void;
}) {
  const buses = useMemo(() => SEATS.map(() => new FrameBus()), []);
  const tier = useTier();
  const [state, setState] = useState<Record<number, SeatState>>({});
  const workers = useRef(new Map<number, Worker>());
  const pending = useRef(new Map<number, (m: FromWorker) => void>());
  const nextId = useRef(1);

  useEffect(() => {
    if (!enabled) { onApi(null); return; }
    const patch = (seat: number, p: Partial<SeatState>) =>
      setState((s) => {
        const base: SeatState = s[seat] ?? { ready: false, hz: 0, note: "", lessons: 0, synapses: 0 };
        return { ...s, [seat]: { ...base, ...p } };
      });
    const ws = SEATS.map(({ seat }, i) => {
      const w = new Worker(new URL("../baseline-room/worker.ts", import.meta.url));
      let lastSlow = 0;
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === "ready") {
          buses[i].ready = m;
          patch(seat, { ready: true });
          w.postMessage({ type: "run", running: true } satisfies ToWorker);
        } else if (m.type === "telemetry") {
          buses[i].push(m);
          const now = performance.now();
          if (now - lastSlow > 500) { lastSlow = now; patch(seat, { hz: m.data.meanHz }); }
        } else if (m.type === "looked" || m.type === "taught") {
          pending.current.get(m.id)?.(m);
          pending.current.delete(m.id);
        }
      };
      w.postMessage({ type: "load", tier } satisfies ToWorker);
      workers.current.set(seat, w);
      return w;
    });
    const ask = (seat: number, msg: ToWorker & { id: number }) => new Promise<FromWorker>((res) => {
      pending.current.set(msg.id, res);
      workers.current.get(seat)?.postMessage(msg);
    });
    const api: BrainsApi = {
      ready: (seat) => !!buses[SEATS.findIndex((s) => s.seat === seat)]?.ready,
      async look(seat, code, ms = 120) {
        patch(seat, { note: `looking at ${KIND_LABELS[code]}` });
        const m = await ask(seat, { type: "look", id: nextId.current++, code, ms });
        if (m.type !== "looked") return { code, approach: 0, avoid: 0, kc: 0 };
        const v = m.approach - m.avoid;
        patch(seat, { note: `${v > 0.05 ? "likes" : v < -0.05 ? "dislikes" : "unsure about"} ${KIND_LABELS[code]}` });
        return { code, approach: m.approach, avoid: m.avoid, kc: m.kc };
      },
      async teach(seat, code, reward, ms = 150) {
        patch(seat, { note: `${reward > 0 ? "rewarded" : "punished"} for ${KIND_LABELS[code]}` });
        const m = await ask(seat, { type: "teach", id: nextId.current++, code, reward, ms });
        const n = m.type === "taught" ? m.synapses : 0;
        setState((s) => ({ ...s, [seat]: { ...s[seat], lessons: (s[seat]?.lessons ?? 0) + 1, synapses: (s[seat]?.synapses ?? 0) + n } }));
        return n;
      },
    };
    onApi(api);
    (window as unknown as { __gflyBrains?: BrainsApi }).__gflyBrains = api;   // a hook for checks from outside
    return () => { ws.forEach((w) => w.terminate()); workers.current.clear(); pending.current.clear(); onApi(null); setState({}); };
  }, [enabled, buses, tier, onApi]);

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
            <p className="t-cap mt-0.5 truncate px-1">{st?.note || (st?.ready ? "watching" : "")}</p>
            {st && st.lessons > 0 && <p className="t-cap truncate px-1 text-label-2">{st.lessons} lessons, {st.synapses.toLocaleString()} synapses changed</p>}
          </div>
        );
      })}
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 t-cap whitespace-nowrap">
        Three live copies of the {TIERS.find((t) => t.tier === tier)!.label.toLowerCase()} brain. Each one throws what its mushroom body likes least, and learns from wins and losses.
      </p>
    </>
  );
}
