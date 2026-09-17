import Link from "next/link";
import type { Product } from "@/experiments/types";

const STATUS: Record<Product["status"], { label: string; cls: string }> = {
  live: { label: "Running", cls: "text-phosphor border-phosphor/40" },
  building: { label: "In build", cls: "text-brass border-brass/40" },
  planned: { label: "Planned", cls: "text-bone-faint border-rule" },
};

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const status = STATUS[product.status];
  const interactive = product.status === "live";

  const body = (
    <article
      className={`plate rise flex h-full flex-col p-6 transition-colors duration-300 ${
        interactive
          ? "hover:border-carmine/60"
          : "hover:border-rule-bright"
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="plate-label">Pl.&nbsp;{product.plate}</span>
        <span className={`plate-label border px-2 py-0.5 ${status.cls}`}>
          {product.status === "live" && (
            <span className="live-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-phosphor align-middle" />
          )}
          {status.label}
        </span>
      </div>

      <h3 className="display mt-5 text-3xl text-bone">{product.title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-bone-dim">
        {product.tagline}
      </p>

      <hr className="hairline my-5" />

      <ul className="readout flex flex-wrap gap-x-3 gap-y-1.5 text-[0.65rem] text-bone-faint">
        {product.circuits.slice(0, 4).map((c) => (
          <li key={c} className="border border-rule px-1.5 py-0.5">
            {c}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        <span
          className={`plate-label ${
            interactive ? "text-carmine" : "text-bone-faint"
          }`}
        >
          {interactive ? "Open the experiment →" : "Read the plan →"}
        </span>
      </div>
    </article>
  );

  return (
    <Link href={`/lab/${product.slug}`} className="block h-full">
      {body}
    </Link>
  );
}
