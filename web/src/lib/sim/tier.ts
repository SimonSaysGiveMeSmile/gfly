"use client";

/**
 * Which cut of the connectome to run. A site-wide choice, remembered in the
 * browser, read by every experiment that boots a brain.
 */
import { useSyncExternalStore } from "react";

export type Tier = 1 | 5 | 10;

export const TIERS: { tier: Tier; label: string; edges: string; size: string; note: string }[] = [
  { tier: 10, label: "Light", edges: "2.7M connections", size: "9 MB", note: "Pairs with 10 or more synapses. Runs faster than real time." },
  { tier: 5, label: "Standard", edges: "6.2M connections", size: "20 MB", note: "Pairs with 5 or more synapses, 72% of all synapses. Real time on a laptop." },
  { tier: 1, label: "Full", edges: "25.6M connections", size: "75 MB", note: "Every significant connection in the release. About a quarter of real time, and a lot of memory." },
];

const KEY = "gfly.tier";
const listeners = new Set<() => void>();
let current: Tier | null = null;

function read(): Tier {
  if (current !== null) return current;
  try {
    const v = Number(localStorage.getItem(KEY));
    current = v === 1 || v === 5 || v === 10 ? v : 5;
  } catch { current = 5; }
  return current;
}

export function getTier(): Tier { return typeof window === "undefined" ? 5 : read(); }

export function setTier(t: Tier) {
  current = t;
  try { localStorage.setItem(KEY, String(t)); } catch {}
  for (const l of listeners) l();
}

export function useTier(): Tier {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => read(),
    () => 5 as Tier,
  );
}
