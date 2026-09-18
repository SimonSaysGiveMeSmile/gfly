"use client";

/**
 * Which body the brain wears. A site-wide choice, remembered in the browser,
 * read by every experiment that puts a creature on screen.
 */
import { useSyncExternalStore } from "react";
import type { BodyKind } from "@/lib/three/body";

const KEY = "gfly.body";
const KINDS: BodyKind[] = ["fly", "dog", "cat", "bird"];
const listeners = new Set<() => void>();
let current: BodyKind | null = null;

function read(): BodyKind {
  if (current !== null) return current;
  try {
    const v = localStorage.getItem(KEY) as BodyKind | null;
    current = v && KINDS.includes(v) ? v : "fly";
  } catch { current = "fly"; }
  return current;
}

export function getBodyKind(): BodyKind { return typeof window === "undefined" ? "fly" : read(); }

export function setBodyKind(k: BodyKind) {
  current = k;
  try { localStorage.setItem(KEY, k); } catch {}
  for (const l of listeners) l();
}

export function useBodyKind(): BodyKind {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => read(),
    () => "fly" as BodyKind,
  );
}
