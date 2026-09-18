"use client";

import Link from "next/link";
import type { Product } from "@/experiments/types";
import { Runner } from "@/experiments/baseline-room/Runner";
import { FINDINGS } from "@/experiments/baseline-room/results";
import { Table } from "@/experiments/mahjong-lobby/Table";
import { ChessTable } from "@/experiments/chess/Table";
import { XiangqiTable } from "@/experiments/xiangqi/Table";
import { SudokuTable } from "@/experiments/sudoku/Table";
import { PokerTable } from "@/experiments/poker/Table";
import { productText, useT, type T } from "@/lib/i18n";

export function LabBody({ product }: { product: Product }) {
  const { t } = useT();
  const text = productText(t, product.slug);
  return (
    <article className="mx-auto w-full max-w-[1400px] px-4 lg:px-10 py-2 flex flex-col">
      <header className="mb-2 flex-shrink-0">
        <Link href="/" className="t-foot hover:text-label">{t("lab.back")}</Link>
        <h1 className="t-title mt-1">{text.title}</h1>
        <p className="t-foot mt-1 max-w-2xl">{text.summary}</p>
      </header>

      <div>
        {product.slug === "baseline-room" ? (
          <>
            <Runner />
            <Findings t={t} />
          </>
        ) : product.slug === "mahjong-lobby" ? (
          <Table />
        ) : product.slug === "chess" ? (
          <ChessTable />
        ) : product.slug === "xiangqi" ? (
          <XiangqiTable />
        ) : product.slug === "sudoku" ? (
          <SudokuTable />
        ) : product.slug === "poker" ? (
          <PokerTable />
        ) : (
          <Planned t={t} />
        )}

        {product.references && (
          <footer className="mt-8">
            <p className="t-cap">{t("lab.checked")}</p>
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
  holds: { key: "outcome.holds", cls: "pill-green" },
  partial: { key: "outcome.partial", cls: "pill-orange" },
  fails: { key: "outcome.fails", cls: "pill-red" },
} as const;

function Findings({ t }: { t: T }) {
  return (
    <section className="mt-8">
      <h2 className="t-title">{t("lab.results")}</h2>
      <p className="t-body mt-2">{t("lab.resultsLead")}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {FINDINGS.map((f) => {
          const o = OUTCOME[f.outcome];
          return (
            <div key={f.title} className="glass p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="t-head">{f.title}</h3>
                <span className={`pill ${o.cls}`}>{t(o.key)}</span>
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

function Planned({ t }: { t: T }) {
  return (
    <div className="glass p-10">
      <h2 className="t-title">{t("lab.notBuilt")}</h2>
      <p className="t-body mt-3 max-w-xl">{t("lab.notBuiltBody")}</p>
      <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="btn mt-6 inline-block">{t("lab.openGithub")}</a>
    </div>
  );
}
