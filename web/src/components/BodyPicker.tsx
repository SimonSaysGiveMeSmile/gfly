"use client";

import { useState } from "react";
import { BODIES } from "@/lib/three/body";
import { setBodyKind, useBodyKind } from "@/lib/sim/body";
import { useT, type Key } from "@/lib/i18n";

/**
 * Fly / dog / cat / bird, for every experiment at once. The menu is a small
 * lobby: each body stands on its ring, as captured from The Room's body view.
 */
export function BodyPicker() {
  const kind = useBodyKind();
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const cur = BODIES.find((b) => b.id === kind)!;
  return (
    <div className="static md:relative">
      <button onClick={() => setOpen(!open)} className="btn text-[13px] lg:text-sm px-2.5 lg:px-3.5" style={{ background: "transparent", fontWeight: 500 }} aria-expanded={open}>
        <span className="hidden sm:inline">{t("nav.body")}: </span>{t(cur.labelKey as Key)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="popover absolute right-2 top-full z-50 mt-1 w-[min(100%,38rem)] p-2 md:right-0 md:top-auto md:mt-2 md:w-[min(92vw,38rem)]">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {BODIES.map((b) => {
                const on = b.id === kind;
                return (
                  <button
                    key={b.id}
                    onClick={() => { setBodyKind(b.id); setOpen(false); }}
                    aria-pressed={on}
                    className={`group flex flex-col rounded-[10px] p-2 text-left transition-colors hover:bg-white/8 ${on ? "bg-white/10" : ""}`}
                  >
                    <span className={`glass-inner aspect-square w-full ${on ? "bg-accent/12" : ""}`} style={on ? { background: "rgba(240,178,90,0.14)" } : undefined}>
                      <img src={`/previews/body-${b.id}.png`} alt="" className="h-[88%] w-[88%] object-contain transition-transform duration-500 group-hover:scale-105" />
                    </span>
                    <span className="mt-2 flex items-baseline justify-between px-0.5">
                      <span className="t-head text-sm">{t(b.labelKey as Key)}</span>
                      {on && <span className="t-cap text-accent">●</span>}
                    </span>
                    <span className="t-foot mt-0.5 px-0.5 text-[12px] leading-snug">{t(`${b.labelKey}.note` as Key)}</span>
                  </button>
                );
              })}
            </div>
            <p className="t-foot px-2 pt-2 pb-1 text-[12px]">{t("body.applies")}</p>
          </div>
        </>
      )}
    </div>
  );
}
