"use client";

/**
 * Which cut of the connectome to run. A site-wide choice, remembered in the
 * browser, read by every experiment that boots a brain.
 */
import { useSyncExternalStore } from "react";

export type Tier = 1 | 5 | 10;

/** Labels and notes are translated under tier.<id> in src/lib/i18n. */
export const TIERS: { tier: Tier; id: "light" | "standard" | "full"; label: string; edges: string; size: string }[] = [
  { tier: 10, id: "light", label: "Light", edges: "2.7M", size: "9 MB" },
  { tier: 5, id: "standard", label: "Standard", edges: "6.2M", size: "20 MB" },
  { tier: 1, id: "full", label: "Full", edges: "25.6M", size: "75 MB" },
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
