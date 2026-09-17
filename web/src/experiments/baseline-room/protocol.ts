/** Messages between the page and the simulation worker. */

export type ToWorker =
  | { type: "load"; tier: number }
  | { type: "run"; running: boolean }
  | { type: "reset" }
  | { type: "assay"; name: AssayName | null }
  | { type: "threat" }
  | { type: "gain"; mvPerSynapse: number }
  | { type: "lesion"; population: "t4t5" | "lplc2" | "giantFiber" | null };

export type AssayName = "optomotor" | "looming" | "wall" | "compass";

export interface Telemetry {
  /** Simulated milliseconds since reset. */
  simMs: number;
  /** Ratio of simulated time to wall time over the last window. */
  realtime: number;
  /** Mean firing rate across the whole brain, Hz. */
  meanHz: number;
  /** Neurons currently being integrated. */
  activeSet: number;
  fly: { x: number; y: number; heading: number; speed: number; turn: number };
  threat: { active: boolean; size: number; bearing: number };
  trail: number[];
  /** Firing rates, Hz, for the populations the assays care about. */
  rates: {
    descendingL: number; descendingR: number;
    giantFiber: number; t4: number; t5: number;
    lplc2L: number; lplc2R: number; epg: number;
  };
  /** Per-neuron EPG activity, normalised 0..1 - the heading bump. */
  epgBump: number[];
  /** Rolling record for the assay currently running. */
  assay: AssayReport | null;
}

export interface AssayReport {
  name: AssayName;
  /** Human-readable pass/fail once enough evidence has accumulated. */
  verdict: "running" | "pass" | "fail";
  detail: string;
  /** What the literature says should happen. */
  expected: string;
  /** Series for the plot, most recent last. */
  series: { t: number; a: number; b: number }[];
  labels: [string, string];
}

export type FromWorker =
  | { type: "progress"; label: string; received: number; total: number }
  | {
      type: "ready";
      neurons: number; edges: number; threshold: number;
      columnsL: number; columnsR: number;
      populations: Record<string, number>;
      loadMs: number;
    }
  | { type: "telemetry"; data: Telemetry }
  | { type: "error"; message: string };
