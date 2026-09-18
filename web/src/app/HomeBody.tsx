"use client";

import Link from "next/link";
import { PRODUCTS } from "@/experiments/registry";
import { ProductCard } from "@/components/ProductCard";
import { useT } from "@/lib/i18n";

const FACTS = [
  { k: "home.facts.neurons", v: "164,740" },
  { k: "home.facts.connections", v: "25,568,639" },
  { k: "home.facts.download", v: "9–80 MB" },
  { k: "home.facts.servers", v: "0" },
] as const;

export function HomeBody() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-[1400px] px-5 lg:px-10 flex flex-col lg:h-full lg:overflow-hidden">
      <section className="grid gap-6 py-8 lg:grid-cols-12 lg:py-12 flex-shrink-0">
        <div className="lg:col-span-7">
          <p className="t-cap rise">{t("home.kicker")}</p>
          <h1 className="t-large rise mt-4" style={{ animationDelay: "60ms" }}>
            {t("home.title1")}<br />{t("home.title2")}
          </h1>
          <p className="t-body rise mt-4 max-w-xl" style={{ animationDelay: "120ms" }}>{t("home.lead")}</p>
          <div className="rise mt-6 flex flex-wrap gap-3" style={{ animationDelay: "180ms" }}>
            <Link href="/lab/baseline-room" className="btn-primary">{t("home.openRoom")}</Link>
            <Link href="/feasibility" className="btn">{t("home.how")}</Link>
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="glass rise p-4" style={{ animationDelay: "240ms" }}>
            <dl className="space-y-1">
              {FACTS.map((f) => (
                <div key={f.k} className="flex items-baseline justify-between py-3">
                  <dt className="t-foot">{t(f.k)}</dt>
                  <dd className="num text-2xl font-semibold">{f.v}</dd>
                </div>
              ))}
            </dl>
            <p className="t-foot mt-3">{t("home.factsNote")}</p>
          </div>
        </div>
      </section>

      <section className="pb-12 lg:flex-1 lg:overflow-y-auto lg:min-h-0">
        <h2 className="t-title">{t("home.experiments")}</h2>
        <p className="t-body mt-2">{t("home.experimentsLead")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p, i) => <ProductCard key={p.slug} product={p} index={i} />)}
        </div>
      </section>
    </div>
  );
}
