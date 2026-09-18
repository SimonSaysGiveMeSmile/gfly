"use client";

import { useT } from "@/lib/i18n";

export function SiteFooter() {
  const { t } = useT();
  return (
    <footer className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-10 lg:py-12">
      <p className="t-foot mb-3">{t("footer.made")}</p>
      <div className="t-foot flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>{t("footer.data")}</p>
        <p>{t("footer.independent")}</p>
      </div>
    </footer>
  );
}
