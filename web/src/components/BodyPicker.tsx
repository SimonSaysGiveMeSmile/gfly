"use client";

import { useState } from "react";
import { BODIES } from "@/lib/three/body";
import { setBodyKind, useBodyKind } from "@/lib/sim/body";
import { useT, type Key } from "@/lib/i18n";

/** Fly / dog / cat / bird, for every experiment at once. */
export function BodyPicker() {
  const kind = useBodyKind();
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const cur = BODIES.find((b) => b.id === kind)!;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="btn text-[13px] lg:text-sm px-2.5 lg:px-3.5" style={{ background: "transparent", fontWeight: 500 }} aria-expanded={open}>
        <span className="hidden sm:inline">{t("nav.body")}: </span>{t(cur.labelKey as Key)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="popover absolute right-0 z-50 mt-2 w-[15rem] p-2">
            {BODIES.map((b) => (
              <button
                key={b.id}
                onClick={() => { setBodyKind(b.id); setOpen(false); }}
                className={`block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/10 ${b.id === kind ? "bg-white/10" : ""}`}
              >
                <span className="t-head text-sm">{t(b.labelKey as Key)}</span>
                <span className="t-cap block">{t(`${b.labelKey}.note` as Key)}</span>
              </button>
            ))}
            <p className="t-cap px-3 pt-2 pb-1">{t("body.applies")}</p>
          </div>
        </>
      )}
    </div>
  );
}
