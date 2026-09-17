import Link from "next/link";

const NAV = [
  { href: "/", label: "Experiments" },
  { href: "/feasibility", label: "How it works" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="glass mx-auto flex max-w-[1400px] items-center gap-2 px-3 py-2" style={{ borderRadius: 999 }}>
        <Link href="/" className="t-head px-3 py-1.5">GFly</Link>
        <nav className="ml-auto flex items-center gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="btn" style={{ background: "transparent", fontWeight: 500 }}>
              {n.label}
            </Link>
          ))}
          <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="btn">
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
