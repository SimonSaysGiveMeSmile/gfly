"use client";

import Link from "next/link";
import { BrainPicker } from "./BrainPicker";
import { LangPicker } from "./LangPicker";
import { BodyPicker } from "./BodyPicker";
import { useT } from "@/lib/i18n";
import { useState } from "react";

const NAV = [
  { href: "/", key: "nav.experiments", icon: "/icons/flask.png" },
  { href: "/feasibility", key: "nav.how", icon: "/icons/how.png" },
  { href: "/about", key: "nav.about", icon: "/icons/about.png" },
] as const;
const ICON = "inline-block h-[18px] w-[18px] rounded-[5px] align-[-4px] mr-1.5";

export function SiteHeader() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 lg:px-4 lg:pt-4" style={{ isolation: "isolate" }}>
      <div className="bar relative mx-auto flex max-w-[1400px] items-center gap-1 px-2 py-1.5 lg:gap-2 lg:px-3 lg:py-2" style={{ borderRadius: 999 }}>
        <Link href="/" className="t-display flex items-center gap-2 px-2 py-1 text-[1.25rem] leading-none"><img src="/logo-96.png" alt="" className="h-8 w-8 rounded-[9px]" />GFly</Link>
        <nav className="ml-auto flex items-center gap-0.5 lg:gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="btn hidden md:inline-block text-[13px] lg:text-sm px-2.5 lg:px-3.5" style={{ background: "transparent", fontWeight: 500 }}>
              <img src={n.icon} alt="" className={ICON} />{t(n.key)}
            </Link>
          ))}
          <BrainPicker />
          <BodyPicker />
          <LangPicker />
          <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="btn hidden md:inline-block">
            <img src="/icons/github.png" alt="" className={ICON} />{t("nav.github")}
          </a>
          {/* Phones: the pages live in a menu so the brain and language pickers keep their room. */}
          <div className="static md:hidden">
            <button onClick={() => setOpen(!open)} className="btn text-[13px] px-2.5" aria-expanded={open} aria-label={t("nav.menu")}>
              <span aria-hidden className="inline-block leading-none" style={{ fontSize: 16 }}>☰</span>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div className="popover absolute right-2 top-full z-50 mt-1 w-[12rem] p-2">
                  {NAV.map((n) => (
                    <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 t-head text-sm hover:bg-white/10"><img src={n.icon} alt="" className={ICON} />{t(n.key)}</Link>
                  ))}
                  <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 t-head text-sm hover:bg-white/10">{t("nav.github")}</a>
                </div>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
