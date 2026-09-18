import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCTS, PRODUCT_BY_SLUG } from "@/experiments/registry";
import { LEARNING_COPY } from "@/experiments/types";
import { Runner } from "@/experiments/baseline-room/Runner";
import { FINDINGS } from "@/experiments/baseline-room/results";

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
    <article className="mx-auto h-full max-w-[1400px] px-6 py-3 lg:px-10 flex flex-col overflow-hidden">
      <header className="mb-3 flex-shrink-0">
        <Link href="/" className="t-foot hover:text-label">← Experiments</Link>
        <h1 className="t-large mt-2">{product.title}</h1>
        <p className="t-body mt-2 max-w-2xl">{product.summary}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="glass p-3">
            <p className="t-cap">What it claims</p>
            <p className="mt-2 text-[15px]">{product.claim}</p>
          </div>
          <div className="glass p-3">
            <p className="t-cap">Learning</p>
            <p className="t-body mt-2 text-[15px]">{LEARNING_COPY[product.learning]}</p>
          </div>
          <div className="glass p-3">
            <p className="t-cap">Parts of the brain used</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {product.circuits.map((c) => <li key={c} className="pill pill-gray">{c}</li>)}
            </ul>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0">
        {product.status === "live" && product.slug === "baseline-room" ? (
          <>
            <Runner />
            <Findings />
          </>
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
