/**
 * Frames arrive from the worker at ~30 Hz. Pushing them through React state
 * would re-render the whole page each time, so the 3D views subscribe here
 * instead and React only sees the slow, human-readable parts.
 */
import type { FromWorker } from "./protocol";

export type Frame = Extract<FromWorker, { type: "telemetry" }>;
export type Ready = Extract<FromWorker, { type: "ready" }>;

type Listener = (f: Frame) => void;

export class FrameBus {
  private listeners = new Set<Listener>();
  latest: Frame | null = null;
  ready: Ready | null = null;

  on(fn: Listener) {
    this.listeners.add(fn);
    if (this.latest) fn(this.latest);
    return () => { this.listeners.delete(fn); };
  }

  push(f: Frame) {
    this.latest = f;
    for (const fn of this.listeners) fn(f);
  }
}
