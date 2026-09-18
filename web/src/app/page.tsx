import Link from "next/link";
import { PRODUCTS } from "@/experiments/registry";
import { ProductCard } from "@/components/ProductCard";

const FACTS = [
  { k: "Neurons", v: "163,997" },
  { k: "Connections", v: "6,236,426" },
  { k: "Download", v: "25 MB" },
  { k: "Servers", v: "0" },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-[1400px] px-5 lg:px-10 flex flex-col lg:h-full lg:overflow-hidden">
      <section className="grid gap-6 py-8 lg:grid-cols-12 lg:py-12 flex-shrink-0">
        <div className="lg:col-span-7">
          <p className="t-cap rise">Fruit fly · complete nervous system · Janelia and Google, 2026</p>
          <h1 className="t-large rise mt-4" style={{ animationDelay: "60ms" }}>
            A real fly brain,<br />running in your browser.
          </h1>
          <p className="t-body rise mt-4 max-w-xl" style={{ animationDelay: "120ms" }}>
            In 2026, Janelia and Google released the complete wiring of a fruit fly brain. Every neuron, every connection, free to anyone.
            GFly loads it into a browser tab and runs it live. No server. No account.
          </p>
          <div className="rise mt-6 flex flex-wrap gap-3" style={{ animationDelay: "180ms" }}>
            <Link href="/lab/baseline-room" className="btn-primary">Open The Room</Link>
            <Link href="/feasibility" className="btn">How it works</Link>
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="glass rise p-4" style={{ animationDelay: "240ms" }}>
            <dl className="space-y-1">
              {FACTS.map((f) => (
                <div key={f.k} className="flex items-baseline justify-between py-3">
                  <dt className="t-foot">{f.k}</dt>
                  <dd className="num text-2xl font-semibold">{f.v}</dd>
                </div>
              ))}
            </dl>
            <p className="t-foot mt-3">
              The published data is 13 GB. Compiled for the browser it is 25 MB, about one short video.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-12 lg:flex-1 lg:overflow-y-auto lg:min-h-0">
        <h2 className="t-title">Experiments</h2>
        <p className="t-body mt-2">Each one is a claim about what the wiring can do, and a test of it.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p, i) => <ProductCard key={p.slug} product={p} index={i} />)}
        </div>
      </section>
    </div>
  );
}
