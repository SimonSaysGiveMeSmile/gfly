"use client";

/**
 * Three languages, one dictionary each, English as the fallback. The choice
 * is remembered in the browser and read through a hook, so any client
 * component can call t("key") and re-render when the language changes.
 */
import { useCallback, useSyncExternalStore } from "react";
import { en, type Key } from "./en";
import { zh } from "./zh";
import { az } from "./az";

export type Lang = "en" | "zh" | "az";
export const LANGS: { id: Lang; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "zh", label: "Chinese", native: "中文" },
  { id: "az", label: "Azerbaijani", native: "Azərbaycanca" },
];

const DICT: Record<Lang, Partial<Record<Key, string | readonly string[]>>> = { en, zh, az };
const KEY = "gfly.lang";
const listeners = new Set<() => void>();
let current: Lang | null = null;

function read(): Lang {
  if (current !== null) return current;
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "zh" || v === "az") current = v;
    else {
      const nav = (navigator.language || "en").toLowerCase();
      current = nav.startsWith("zh") ? "zh" : nav.startsWith("az") ? "az" : "en";
    }
  } catch { current = "en"; }
  return current;
}

export function getLang(): Lang { return typeof window === "undefined" ? "en" : read(); }

export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch {}
  if (typeof document !== "undefined") document.documentElement.lang = l === "zh" ? "zh-CN" : l;
  for (const fn of listeners) fn();
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => read(),
    () => "en" as Lang,
  );
}

type Params = Record<string, string | number>;

function fill(s: string, p?: Params) {
  if (!p) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m));
}

/** Translate a key in a given language, with {placeholders}. */
export function tr(lang: Lang, key: Key, params?: Params): string {
  const v = DICT[lang][key] ?? en[key];
  return fill(typeof v === "string" ? v : String(v), params);
}

/** Array-valued entries (table headings and the like). */
export function trList(lang: Lang, key: Key): readonly string[] {
  const v = DICT[lang][key] ?? en[key];
  return Array.isArray(v) ? v : [String(v)];
}

export type T = (key: Key, params?: Params) => string;

/** The translator for the current language; re-renders on change. */
export function useT(): { t: T; list: (key: Key) => readonly string[]; lang: Lang } {
  const lang = useLang();
  const t = useCallback<T>((key, params) => tr(lang, key, params), [lang]);
  const list = useCallback((key: Key) => trList(lang, key), [lang]);
  return { t, list, lang };
}

/**
 * Strings that belong to one experiment. The room keeps its own small
 * dictionary next to its code; English is required, the others fall back.
 */
export type LocalDict<K extends string> = { en: Record<K, string>; zh?: Partial<Record<K, string>>; az?: Partial<Record<K, string>> };

export function useLocalT<K extends string>(dict: LocalDict<K>): { lt: (key: K, params?: Params) => string; t: T; lang: Lang } {
  const { t, lang } = useT();
  const lt = useCallback((key: K, params?: Params) => fill(dict[lang]?.[key] ?? dict.en[key], params), [dict, lang]);
  return { lt, t, lang };
}

/** Mahjong tile names, 0..33. */
export function tileName(t: T, kind: number): string {
  if (kind < 9) return t("tile.man", { n: kind + 1 });
  if (kind < 18) return t("tile.pin", { n: kind - 8 });
  if (kind < 27) return t("tile.sou", { n: kind - 17 });
  return t((["tile.east", "tile.south", "tile.west", "tile.north", "tile.red", "tile.green", "tile.white"] as const)[kind - 27]);
}

/** Product copy from the registry, translated by slug. */
export function productText(t: T, slug: string): { title: string; tagline: string; summary: string } {
  const k = (f: string) => `product.${slug}.${f}` as Key;
  return { title: t(k("title")), tagline: t(k("tagline")), summary: t(k("summary")) };
}

export type { Key };
