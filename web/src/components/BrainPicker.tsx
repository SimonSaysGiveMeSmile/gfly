"use client";

import { useState } from "react";
import { TIERS, setTier, useTier } from "@/lib/sim/tier";
import { useT, type Key } from "@/lib/i18n";

/** The site-wide choice of how much of the connectome to run. */
export function BrainPicker() {
  const tier = useTier();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const cur = TIERS.find((x) => x.tier === tier)!;
  const name = (id: string) => t(`tier.${id}` as Key);
  const note = (id: string) => t(`tier.${id}.note` as Key);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="btn text-[13px] lg:text-sm px-2.5 lg:px-3.5" style={{ background: "transparent", fontWeight: 500 }} aria-expanded={open}>
        {t("nav.brain")}: {name(cur.id)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="popover absolute right-0 z-50 mt-2 w-[19rem] p-2">
            {TIERS.map((x) => (
              <button
                key={x.tier}
                onClick={() => { setTier(x.tier); setOpen(false); }}
                className={`block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/10 ${x.tier === tier ? "bg-white/10" : ""}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="t-head text-sm">{name(x.id)}</span>
                  <span className="t-cap num">{t("tier.connections", { n: x.edges })} · {x.size}</span>
                </span>
                <span className="t-cap block mt-0.5">{note(x.id)}</span>
              </button>
            ))}
            <p className="t-cap px-3 pt-2 pb-1">{t("tier.applies")}</p>
          </div>
        </>
      )}
    </div>
  );
}
