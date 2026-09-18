"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

export function AboutBody() {
  const { t } = useT();
  const adding = t("about.adding.body", { code: "\u0000" }).split("\u0000");
  return (
    <article className="mx-auto max-w-[900px] px-5 py-8 lg:px-10 flex flex-col lg:h-full lg:overflow-y-auto">
      <h1 className="t-large">{t("about.title")}</h1>
      <div className="t-body mt-4 space-y-4">
        <p>{t("about.p1")}</p>
        <p>{t("about.p2")}</p>
        <p>
          {t("about.p3")}{" "}
          <Link href="/feasibility" className="text-blue">{t("about.p3.link")}</Link>
        </p>

        <h2 className="t-title pt-3 text-label">{t("about.real")}</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("about.real.1")}</li>
          <li>{t("about.real.2")}</li>
          <li>{t("about.real.3")}</li>
          <li>{t("about.real.4")}</li>
        </ul>

        <h2 className="t-title pt-3 text-label">{t("about.adding")}</h2>
        <p>
          {adding[0]}<code className="text-label">src/experiments/</code>{adding[1]}
        </p>

        <h2 className="t-title pt-3 text-label">{t("about.credit")}</h2>
        <p>{t("about.credit.body")}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="https://male-cns.janelia.org/" target="_blank" rel="noreferrer" className="btn">{t("about.dataset")}</a>
        <a href="https://github.com/TuragaLab/flybody" target="_blank" rel="noreferrer" className="btn">flybody</a>
        <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="btn">GitHub</a>
      </div>
    </article>
  );
}
