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
    <div className="mx-auto max-w-[1400px] px-5 lg:px-10 flex flex-col">
      <section className="py-10 lg:py-16 flex-shrink-0">
        <p className="t-cap rise">{t("home.kicker")}</p>
        <h1 className="t-large rise mt-5 max-w-[14ch]" style={{ animationDelay: "60ms" }}>
          {t("home.title1")}<br />{t("home.title2")}
        </h1>
        <div className="mt-7 grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-6">
            <p className="t-body rise max-w-xl" style={{ animationDelay: "120ms" }}>{t("home.lead")}</p>
            <div className="rise mt-6 flex flex-wrap gap-3" style={{ animationDelay: "180ms" }}>
              <Link href="/lab/baseline-room" className="btn-primary">{t("home.openRoom")}</Link>
              <Link href="/feasibility" className="btn">{t("home.how")}</Link>
            </div>
          </div>
          {/* The numbers, as a strip: no card, just a rule of light under them. */}
          <dl className="rise grid grid-cols-2 gap-x-8 gap-y-6 lg:col-span-6 lg:pl-8" style={{ animationDelay: "240ms" }}>
            {FACTS.map((f) => (
              <div key={f.k}>
                <dd className="num whitespace-nowrap text-[1.8rem] font-semibold leading-none tracking-tight lg:text-[2.1rem]">{f.v}</dd>
                <dt className="t-cap mt-2">{t(f.k)}</dt>
              </div>
            ))}
            <p className="t-foot col-span-2 max-w-2xl">{t("home.factsNote")}</p>
          </dl>
        </div>
      </section>

      <section className="pb-12">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="t-title">{t("home.experiments")}</h2>
          <p className="t-body">{t("home.experimentsLead")}</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p, i) => <ProductCard key={p.slug} product={p} index={i} />)}
        </div>
      </section>
    </div>
  );
}
