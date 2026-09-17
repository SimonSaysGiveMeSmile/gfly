import Link from "next/link";
import { PRODUCTS } from "@/experiments/registry";
import { ProductCard } from "@/components/ProductCard";

const FACTS = [
  { k: "Neurons", v: "163,997" },
  { k: "Connections", v: "6,236,426" },
  { k: "Synapses", v: "89,737,406" },
  { k: "Download", v: "21.7 MB" },
  { k: "Servers", v: "0" },
];

export default function Home() {
  return (
    <>
      {/* ---- Plate I: the claim ------------------------------------- */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          <div className="grid gap-12 py-20 lg:grid-cols-12 lg:gap-8 lg:py-28">
            <div className="lg:col-span-7">
              <p className="plate-label rise">
                Drosophila melanogaster · male · central nervous system
              </p>

              <h1
                className="display rise mt-7 text-[clamp(3rem,8.5vw,7.5rem)] text-bone"
                style={{ animationDelay: "80ms" }}
              >
                A whole fly brain,
                <br />
                <span className="text-carmine">running in a tab.</span>
              </h1>

              <p
                className="rise mt-9 max-w-xl text-lg leading-relaxed text-bone-dim"
                style={{ animationDelay: "160ms" }}
              >
                In June 2026 Janelia and Google Research released the complete
                wiring diagram of a male fruit fly&nbsp;&mdash; every neuron,
                every connection, free to anyone. GFly is a field guide to what
                you can actually build with it, starting from one question:
                does the whole thing fit in a browser?
              </p>

              <p
                className="rise readout mt-6 max-w-xl text-lg text-phosphor"
                style={{ animationDelay: "220ms" }}
              >
                It does. Here is the measurement.
              </p>

              <div
                className="rise mt-10 flex flex-wrap gap-4"
                style={{ animationDelay: "280ms" }}
              >
                <Link
                  href="/lab/baseline-room"
                  className="plate-label border border-carmine bg-carmine px-5 py-3 text-ink transition-colors hover:bg-transparent hover:text-carmine"
                >
                  Open Plate I — The Baseline Room
                </Link>
                <Link
                  href="/feasibility"
                  className="plate-label border border-rule px-5 py-3 transition-colors hover:border-bone hover:text-bone"
                >
                  Read the numbers
                </Link>
              </div>
            </div>

            {/* Specimen-plate stat column */}
            <div className="lg:col-span-5 lg:pl-8">
              <div
                className="plate rise h-full p-7"
                style={{ animationDelay: "340ms" }}
              >
                <p className="plate-label">Fig. 1 — the working set</p>
                <dl className="mt-6 space-y-0">
                  {FACTS.map((f, i) => (
                    <div key={f.k}>
                      <div className="flex items-baseline justify-between gap-4 py-3.5">
                        <dt className="plate-label">{f.k}</dt>
                        <dd className="readout text-2xl text-bone">{f.v}</dd>
                      </div>
                      {i < FACTS.length - 1 && <hr className="hairline" />}
                    </div>
                  ))}
                </dl>
                <hr className="hairline my-4" />
                <p className="text-xs leading-relaxed text-bone-faint">
                  The published tables run to 13&nbsp;GB and the bucket serves
                  no CORS headers, so none of it can be fetched from a page.
                  Compiled down to a sparse adjacency structure it becomes
                  21.7&nbsp;MB of static assets &mdash; about the weight of one
                  short video &mdash; and then never needs a server again.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- The catalogue ------------------------------------------- */}
      <section className="mx-auto max-w-[1400px] px-6 py-20 lg:px-10">
        <div className="flex items-end justify-between gap-8 border-b border-rule pb-6">
          <div>
            <p className="plate-label">The catalogue</p>
            <h2 className="display mt-3 text-5xl text-bone">
              Seven things to do
              <br />
              with a wiring diagram
            </h2>
          </div>
          <p className="hidden max-w-xs text-sm leading-relaxed text-bone-faint md:block">
            Each plate is a self-contained experiment with its own claim, its
            own circuits, and its own way of being wrong.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p, i) => (
            <ProductCard key={p.slug} product={p} index={i} />
          ))}
        </div>
      </section>
    </>
  );
}
