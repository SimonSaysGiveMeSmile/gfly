"use client";

import { useState } from "react";
import { TIERS, setTier, useTier } from "@/lib/sim/tier";

/** The site-wide choice of how much of the connectome to run. */
export function BrainPicker() {
  const tier = useTier();
  const [open, setOpen] = useState(false);
  const cur = TIERS.find((t) => t.tier === tier)!;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="btn text-[13px] lg:text-sm px-2.5 lg:px-3.5" style={{ background: "transparent", fontWeight: 500 }} aria-expanded={open}>
        Brain: {cur.label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass absolute right-0 z-50 mt-2 w-[19rem] p-2">
            {TIERS.map((t) => (
              <button
                key={t.tier}
                onClick={() => { setTier(t.tier); setOpen(false); }}
                className={`block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/10 ${t.tier === tier ? "bg-white/10" : ""}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="t-head text-sm">{t.label}</span>
                  <span className="t-cap num">{t.edges} · {t.size}</span>
                </span>
                <span className="t-cap block mt-0.5">{t.note}</span>
              </button>
            ))}
            <p className="t-cap px-3 pt-2 pb-1">Applies to every experiment. A running brain reloads when you change it.</p>
          </div>
        </>
      )}
    </div>
  );
}
