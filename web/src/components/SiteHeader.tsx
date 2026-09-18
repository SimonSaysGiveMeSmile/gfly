import Link from "next/link";
import { BrainPicker } from "./BrainPicker";

const NAV = [
  { href: "/", label: "Experiments" },
  { href: "/feasibility", label: "How it works" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 lg:px-4 lg:pt-4">
      <div className="glass mx-auto flex max-w-[1400px] items-center gap-1 px-2 py-1.5 lg:gap-2 lg:px-3 lg:py-2" style={{ borderRadius: 999 }}>
        <Link href="/" className="t-head px-3 py-1.5">GFly</Link>
        <nav className="ml-auto flex items-center gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="btn text-[13px] lg:text-sm px-2.5 lg:px-3.5" style={{ background: "transparent", fontWeight: 500 }}>
              {n.label}
            </Link>
          ))}
          <BrainPicker />
          <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="btn hidden sm:inline-block">
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
