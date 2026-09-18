"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

const THRESHOLDS = [
  { t: "1+", edges: "25,568,639", pct: "100%", gz: "75 MB", ship: true },
  { t: "5+", edges: "6,236,426", pct: "72%", gz: "20 MB", ship: true },
  { t: "10+", edges: "2,749,558", pct: "54%", gz: "9 MB", ship: true },
  { t: "20+", edges: "1,060,450", pct: "36%", gz: "3.5 MB", ship: false },
];
const PERF = [
  { dt: "1 ms", rt: "0.95", best: true },
  { dt: "1 ms", rt: "0.35" },
  { dt: "1 ms", rt: "1.11" },
];

export function HowBody() {
  const { t, list } = useT();
  const rows = list("how.s3.rows");
  return (
    <article className="mx-auto max-w-[900px] px-5 py-8 lg:px-10 flex flex-col lg:h-full lg:overflow-y-auto">
      <h1 className="t-large">{t("how.title")}</h1>
      <p className="t-body mt-4">{t("how.lead")}</p>

      <Section title={t("how.s1.title")}><p>{t("how.s1.body")}</p></Section>

      <Section title={t("how.s2.title")}>
        <p>{t("how.s2.body")}</p>
        <Table head={list("how.s2.head")} rows={THRESHOLDS.map((r) => [
          <b key="a" className={r.ship ? "text-green" : ""}>{r.t}</b>, r.edges, r.pct, r.gz,
        ])} />
        <p>{t("how.s2.after")}</p>
      </Section>

      <Section title={t("how.s3.title")}>
        <p>{t("how.s3.body")}</p>
        <Table head={list("how.s3.head")} rows={PERF.map((p, i) => [rows[i], p.dt, <b key="s" className={p.best ? "text-green" : ""}>{t("how.s3.realtime", { n: p.rt })}</b>])} />
      </Section>

      <Section title={t("how.s4.title")}>
        <p>{t("how.s4.body")}</p>
        <ul className="list-disc space-y-3 pl-5">
          <li><b>{t("how.s4.a.b")}</b> {t("how.s4.a")}</li>
          <li><b>{t("how.s4.b.b")}</b> {t("how.s4.b")}</li>
          <li><b>{t("how.s4.c.b")}</b> {t("how.s4.c")}</li>
        </ul>
      </Section>

      <Section title={t("how.s5.title")}><p>{t("how.s5.body")}</p></Section>

      <div className="glass mt-8 p-6">
        <h2 className="t-title">{t("how.cta.title")}</h2>
        <p className="t-body mt-2">{t("how.cta.body")}</p>
        <Link href="/lab/baseline-room" className="btn-primary mt-4 inline-block">{t("how.cta.button")}</Link>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="t-title">{title}</h2>
      <div className="t-body mt-3 space-y-3 [&_b]:text-label">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: readonly string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="glass overflow-x-auto p-2">
      <table className="w-full min-w-[480px] text-[15px]">
        <thead><tr>{head.map((h, i) => <th key={i} className="t-cap px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className="num px-3 py-2.5">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
