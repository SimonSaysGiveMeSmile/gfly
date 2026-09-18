"use client";

import Link from "next/link";
import { BrainPicker } from "./BrainPicker";
import { LangPicker } from "./LangPicker";
import { BodyPicker } from "./BodyPicker";
import { useT } from "@/lib/i18n";
import { useState } from "react";

const NAV = [
  { href: "/", key: "nav.experiments" },
  { href: "/feasibility", key: "nav.how" },
  { href: "/about", key: "nav.about" },
] as const;

export function SiteHeader() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 lg:px-4 lg:pt-4" style={{ isolation: "isolate" }}>
      <div className="glass mx-auto flex max-w-[1400px] items-center gap-1 px-2 py-1.5 lg:gap-2 lg:px-3 lg:py-2" style={{ borderRadius: 999 }}>
        <Link href="/" className="t-display px-3 py-1 text-[1.25rem] leading-none">GFly</Link>
        <nav className="ml-auto flex items-center gap-0.5 lg:gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="btn hidden md:inline-block text-[13px] lg:text-sm px-2.5 lg:px-3.5" style={{ background: "transparent", fontWeight: 500 }}>
              {t(n.key)}
            </Link>
          ))}
          <BrainPicker />
          <BodyPicker />
          <LangPicker />
          <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="btn hidden md:inline-block">
            {t("nav.github")}
          </a>
          {/* Phones: the pages live in a menu so the brain and language pickers keep their room. */}
          <div className="relative md:hidden">
            <button onClick={() => setOpen(!open)} className="btn text-[13px] px-2.5" aria-expanded={open} aria-label={t("nav.menu")}>
              <span aria-hidden className="inline-block leading-none" style={{ fontSize: 16 }}>☰</span>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div className="popover absolute right-0 z-50 mt-2 w-[12rem] p-2">
                  {NAV.map((n) => (
                    <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 t-head text-sm hover:bg-white/10">{t(n.key)}</Link>
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
