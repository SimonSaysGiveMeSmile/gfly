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
  if (!p) return {};
  return { title: p.title, description: p.tagline };
}

export default async function LabPage({ params }: PageProps<"/lab/[slug]">) {
  const product = PRODUCT_BY_SLUG.get((await params).slug);
  if (!product) notFound();

  return (
    <article className="mx-auto max-w-[1400px] px-6 py-14 lg:px-10">
      <header className="border-b border-rule pb-10">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="plate-label hover:text-bone">
            ← Index
          </Link>
          <span className="plate-label">Pl.&nbsp;{product.plate}</span>
        </div>

        <h1 className="display mt-6 text-[clamp(2.5rem,6vw,5rem)] text-bone">
          {product.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-bone-dim">
          {product.summary}
        </p>

        <div className="mt-8 grid gap-6 border-t border-rule pt-8 sm:grid-cols-3">
          <div>
            <p className="plate-label">The claim</p>
            <p className="mt-2 text-sm leading-relaxed text-bone">{product.claim}</p>
          </div>
          <div>
            <p className="plate-label">Learning</p>
            <p className="mt-2 text-sm leading-relaxed text-bone-dim">
              {LEARNING_COPY[product.learning]}
            </p>
          </div>
          <div>
            <p className="plate-label">Circuits</p>
            <ul className="readout mt-2 flex flex-wrap gap-1.5 text-[0.65rem] text-bone-faint">
              {product.circuits.map((c) => (
                <li key={c} className="border border-rule px-1.5 py-0.5">{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </header>

      <div className="py-10">
        {product.status === "live" && product.slug === "baseline-room" ? (
          <>
            <Runner />
            <Findings />
          </>
        ) : (
          <Planned />
        )}
      </div>

      {product.references && (
        <footer className="border-t border-rule pt-8">
          <p className="plate-label">Checked against</p>
          <ul className="mt-3 space-y-2">
            {product.references.map((r) => (
              <li key={r.href}>
                <a
                  href={r.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-bone-dim underline decoration-rule underline-offset-4 hover:text-brass"
                >
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  );
}

const OUTCOME = {
  holds: { label: "Holds", cls: "border-phosphor/50 text-phosphor" },
  partial: { label: "Inconclusive", cls: "border-brass/50 text-brass" },
  fails: { label: "Fails", cls: "border-carmine/60 text-carmine" },
} as const;

function Findings() {
  return (
    <section className="mt-16 border-t border-rule pt-10">
      <p className="plate-label">Fig. 7 — what happened</p>
      <h2 className="display mt-3 text-4xl text-bone">Results, including the bad ones</h2>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-bone-dim">
        Run from the headless harness against the same code this page executes.
        Two of the four hold, one is inconclusive, and one fails.
      </p>

      <div className="mt-8 space-y-px">
        {FINDINGS.map((f) => {
          const o = OUTCOME[f.outcome];
          return (
            <div key={f.assay} className="plate p-6">
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="display text-2xl text-bone">{f.assay}</h3>
                <span className={`plate-label border px-2 py-0.5 ${o.cls}`}>{o.label}</span>
              </div>
              <p className="readout mt-3 max-w-3xl text-xs leading-relaxed text-bone-dim">
                {f.measured}
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-bone-faint">
                {f.reading}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Planned() {
  return (
    <div className="plate p-10">
      <p className="plate-label">Not built yet</p>
      <h2 className="display mt-4 text-3xl text-bone">
        This plate is still a plan.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-bone-dim">
        The connectome and the simulation engine behind Plate&nbsp;I are already
        general enough to carry this one. What is missing is the world it needs
        and the read-out that would make it falsifiable. If you want to build
        it, the repository is open.
      </p>
      <a
        href="https://github.com/gfly-site/gfly"
        target="_blank"
        rel="noreferrer"
        className="btn mt-7 inline-block"
      >
        Take it on →
      </a>
    </div>
  );
}
