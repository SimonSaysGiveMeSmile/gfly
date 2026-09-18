"use client";

import { useEffect, useState } from "react";
import { LANGS, setLang, useLang } from "@/lib/i18n";

/** EN / 中文 / AZ, remembered in the browser. */
export function LangPicker() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  useEffect(() => { document.documentElement.lang = lang === "zh" ? "zh-CN" : lang; }, [lang]);
  const cur = LANGS.find((l) => l.id === lang)!;
  return (
    <div className="static md:relative">
      <button onClick={() => setOpen(!open)} className="btn text-[13px] lg:text-sm px-2.5 lg:px-3.5" style={{ background: "transparent", fontWeight: 500 }} aria-expanded={open} aria-label="Language">
        {cur.id === "en" ? "EN" : cur.id === "zh" ? "中文" : "AZ"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="popover absolute right-2 top-full z-50 mt-1 w-[11rem] p-2 md:right-0 md:top-auto md:mt-2">
            {LANGS.map((l) => (
              <button
                key={l.id}
                onClick={() => { setLang(l.id); setOpen(false); }}
                className={`block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/10 ${l.id === lang ? "bg-white/10" : ""}`}
              >
                <span className="t-head text-sm">{l.native}</span>
                <span className="t-cap block">{l.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
