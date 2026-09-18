"use client";

import Link from "next/link";
import type { Product } from "@/experiments/types";
import { productText, useT } from "@/lib/i18n";

const STATUS: Record<Product["status"], { key: "status.live" | "status.building" | "status.planned"; cls: string }> = {
  live: { key: "status.live", cls: "pill-green" },
  building: { key: "status.building", cls: "pill-orange" },
  planned: { key: "status.planned", cls: "pill-gray" },
};

/**
 * One experiment. Rooms that exist show themselves: a still of the room
 * fills the card and the number and status sit on it. Rooms that do not yet
 * exist are words on the glass.
 */
export function ProductCard({ product, index }: { product: Product; index: number }) {
  const { t } = useT();
  const s = STATUS[product.status];
  const text = productText(t, product.slug);
  const badge = (
    <div className="flex items-center justify-between">
      <span className="t-cap num">{product.number}</span>
      <span className={`pill ${s.cls}`}>{product.status === "live" && <span className="live-dot" />}{t(s.key)}</span>
    </div>
  );
  return (
    <Link href={`/lab/${product.slug}`} className="block h-full">
      <article className="glass rise flex h-full flex-col p-2 transition-colors hover:bg-white/8" style={{ animationDelay: `${index * 45}ms` }}>
        {product.preview ? (
          <div className="still aspect-[16/10] w-full">
            <img src={product.preview} alt="" loading="lazy" />
            <div className="absolute inset-x-0 top-0 z-10 p-3">{badge}</div>
          </div>
        ) : (
          <div className="glass-inner aspect-[16/10] w-full flex-col items-start justify-start p-3">
            {badge}
            <p className="t-italic mt-auto self-start text-[1.35rem] leading-tight text-label-3">{text.tagline}</p>
          </div>
        )}
        <div className="flex flex-1 flex-col px-2 pb-2 pt-3">
          <h3 className="t-title">{text.title}</h3>
          <p className="t-body mt-1 text-[15px]">{text.tagline}</p>
          <div className="mt-auto pt-4">
            <span className={`text-[14px] font-semibold ${product.status === "live" ? "text-accent" : "text-label-2"}`}>
              {product.status === "live" ? t("card.open") : t("card.plan")} →
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
