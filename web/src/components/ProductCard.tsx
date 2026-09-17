import Link from "next/link";
import type { Product } from "@/experiments/types";

const STATUS: Record<Product["status"], { label: string; cls: string }> = {
  live: { label: "Live", cls: "pill-green" },
  building: { label: "In progress", cls: "pill-orange" },
  planned: { label: "Planned", cls: "pill-gray" },
};

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const s = STATUS[product.status];
  return (
    <Link href={`/lab/${product.slug}`} className="block h-full">
      <article className="glass rise flex h-full flex-col p-6 transition-colors hover:bg-white/10" style={{ animationDelay: `${index * 50}ms` }}>
        <div className="flex items-center justify-between">
          <span className="t-cap num">{product.number}</span>
          <span className={`pill ${s.cls}`}>{product.status === "live" && <span className="live-dot" />}{s.label}</span>
        </div>
        <h3 className="t-title mt-5">{product.title}</h3>
        <p className="t-body mt-2 text-[15px]">{product.tagline}</p>
        <div className="mt-auto pt-6">
          <span className={`text-[15px] font-semibold ${product.status === "live" ? "text-blue" : "text-label-2"}`}>
            {product.status === "live" ? "Open" : "Read the plan"} →
          </span>
        </div>
      </article>
    </Link>
  );
}
