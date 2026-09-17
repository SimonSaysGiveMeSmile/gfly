import Link from "next/link";

const NAV = [
  { href: "/", label: "Index" },
  { href: "/feasibility", label: "Feasibility" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-baseline gap-8 px-6 py-3.5 lg:px-10">
        <Link href="/" className="group flex items-baseline gap-2.5">
          <span className="display text-xl text-bone">GFly</span>
          <span className="plate-label hidden transition-colors group-hover:text-carmine sm:inline">
            Male&nbsp;CNS v1.0
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-7">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="plate-label transition-colors hover:text-bone"
            >
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/gfly-site/gfly"
            target="_blank"
            rel="noreferrer"
            className="plate-label border border-rule px-2.5 py-1 transition-colors hover:border-brass hover:text-brass"
          >
            Source
          </a>
        </nav>
      </div>
    </header>
  );
}
