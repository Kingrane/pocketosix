"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/ui/site-header";
import { useLanguage } from "@/components/ui/language-provider";

export default function NotFound() {
  const { locale, t } = useLanguage();

  return (
    <div className="utility-page" lang={locale}>
      <SiteHeader compact />
      <main className="utility-main" id="main-content" tabIndex={-1}>
        <div className="utility-content">
          <p>{t("utility.notFound.code")}</p>
          <h1>{t("utility.notFound.title")}</h1>
          <p>{t("utility.notFound.detail")}</p>
          <div className="utility-actions">
            <Link href="/" className="button button-primary">{t("utility.notFound.home")}</Link>
            <Link href="/docs" className="button button-secondary">{t("common.docs")}</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
