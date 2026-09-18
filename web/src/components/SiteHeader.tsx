"use client";

import Link from "next/link";
import { BrainPicker } from "./BrainPicker";
import { LangPicker } from "./LangPicker";
import { useT } from "@/lib/i18n";

const NAV = [
  { href: "/", key: "nav.experiments" },
  { href: "/feasibility", key: "nav.how" },
  { href: "/about", key: "nav.about" },
] as const;

export function SiteHeader() {
  const { t } = useT();
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 lg:px-4 lg:pt-4" style={{ isolation: "isolate" }}>
      <div className="glass mx-auto flex max-w-[1400px] items-center gap-1 px-2 py-1.5 lg:gap-2 lg:px-3 lg:py-2" style={{ borderRadius: 999 }}>
        <Link href="/" className="t-head px-3 py-1.5">GFly</Link>
        <nav className="ml-auto flex items-center gap-0.5 lg:gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="btn text-[13px] lg:text-sm px-2.5 lg:px-3.5" style={{ background: "transparent", fontWeight: 500 }}>
              {t(n.key)}
            </Link>
          ))}
          <BrainPicker />
          <LangPicker />
          <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="btn hidden sm:inline-block">
            {t("nav.github")}
          </a>
        </nav>
      </div>
    </header>
  );
}
