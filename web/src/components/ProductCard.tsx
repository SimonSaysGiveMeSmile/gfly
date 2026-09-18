"use client";

import Link from "next/link";
import type { Product } from "@/experiments/types";
import { productText, useT } from "@/lib/i18n";

const STATUS: Record<Product["status"], { key: "status.live" | "status.building" | "status.planned"; cls: string }> = {
  live: { key: "status.live", cls: "pill-green" },
  building: { key: "status.building", cls: "pill-orange" },
  planned: { key: "status.planned", cls: "pill-gray" },
};

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const { t } = useT();
  const s = STATUS[product.status];
  const text = productText(t, product.slug);
  return (
    <Link href={`/lab/${product.slug}`} className="block h-full">
      <article className="glass rise flex h-full flex-col p-6 transition-colors hover:bg-white/10" style={{ animationDelay: `${index * 50}ms` }}>
        <div className="flex items-center justify-between">
          <span className="t-cap num">{product.number}</span>
          <span className={`pill ${s.cls}`}>{product.status === "live" && <span className="live-dot" />}{t(s.key)}</span>
        </div>
        <h3 className="t-title mt-5">{text.title}</h3>
        <p className="t-body mt-2 text-[15px]">{text.tagline}</p>
        <div className="mt-auto pt-6">
          <span className={`text-[15px] font-semibold ${product.status === "live" ? "text-blue" : "text-label-2"}`}>
            {product.status === "live" ? t("card.open") : t("card.plan")} →
          </span>
        </div>
      </article>
    </Link>
  );
}
