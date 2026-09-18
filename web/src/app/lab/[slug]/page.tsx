import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCTS, PRODUCT_BY_SLUG } from "@/experiments/registry";
import { Runner } from "@/experiments/baseline-room/Runner";
import { FINDINGS } from "@/experiments/baseline-room/results";
import { Table } from "@/experiments/mahjong-lobby/Table";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/lab/[slug]">) {
  const p = PRODUCT_BY_SLUG.get((await params).slug);
  return p ? { title: p.title, description: p.tagline } : {};
}

export default async function LabPage({ params }: PageProps<"/lab/[slug]">) {
  const product = PRODUCT_BY_SLUG.get((await params).slug);
  if (!product) notFound();

  return (
    <article className="mx-auto w-full max-w-[1400px] px-4 lg:px-10 py-2 flex flex-col lg:h-full lg:overflow-hidden">
      <header className="mb-2 flex-shrink-0">
        <Link href="/" className="t-foot hover:text-label">← Experiments</Link>
        <h1 className="t-title mt-1">{product.title}</h1>
        <p className="t-foot mt-1 max-w-2xl">{product.summary}</p>
      </header>

      <div className="lg:flex-1 lg:overflow-y-auto lg:min-h-0">
        {product.slug === "baseline-room" ? (
          <>
            <Runner />
            <Findings />
          </>
        ) : product.slug === "mahjong-lobby" ? (
          <Table />
        ) : (
          <Planned />
        )}

        {product.references && (
          <footer className="mt-8">
            <p className="t-cap">Checked against</p>
            <ul className="mt-2 space-y-1.5">
              {product.references.map((r) => (
                <li key={r.href}>
                  <a href={r.href} target="_blank" rel="noreferrer" className="t-foot underline decoration-line underline-offset-4 hover:text-label">{r.label}</a>
                </li>
              ))}
            </ul>
          </footer>
        )}
      </div>
    </article>
  );
}

const OUTCOME = {
  holds: { label: "Works", cls: "pill-green" },
  partial: { label: "Unclear", cls: "pill-orange" },
  fails: { label: "Fails", cls: "pill-red" },
} as const;

function Findings() {
  return (
    <section className="mt-8">
      <h2 className="t-title">Results</h2>
      <p className="t-body mt-2">Two of four tests pass. One is unclear. One fails, and here is why.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {FINDINGS.map((f) => {
          const o = OUTCOME[f.outcome];
          return (
            <div key={f.title} className="glass p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="t-head">{f.title}</h3>
                <span className={`pill ${o.cls}`}>{o.label}</span>
              </div>
              <p className="t-foot mt-3">{f.measured}</p>
              <p className="mt-3 text-[15px]">{f.reading}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Planned() {
  return (
    <div className="glass p-10">
      <h2 className="t-title">Not built yet</h2>
      <p className="t-body mt-3 max-w-xl">
        The brain and the simulator behind The Room already work. This experiment needs its own world and its own test. The code is open if you want to build it.
      </p>
      <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="btn mt-6 inline-block">Open on GitHub</a>
    </div>
  );
}
