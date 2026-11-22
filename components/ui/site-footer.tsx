"use client";

import Link from "next/link";
import { GITHUB_URL, LICENSE_URL } from "@/lib/site-links";
import { Logo } from "./logo";
import { LanguageSwitcher } from "./language-switcher";
import { useLanguage } from "./language-provider";
import styles from "@/components/landing/site-chrome.module.css";

export function SiteFooter() {
  const { t } = useLanguage();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <Link className={styles.footerBrand} href="/" aria-label={t("common.home")}><Logo /></Link>
        <nav className={styles.footerNav} aria-label={t("landing.footerNavigation")}>
          <Link href="/docs">{t("common.docs")}</Link>
          <a href={GITHUB_URL}>{t("common.github")}</a>
          <a href={LICENSE_URL}>{t("common.license")}</a>
          <LanguageSwitcher />
        </nav>
      </div>
      <div className={styles.footerBottom}>
        <p className={styles.licenseNote}>{t("landing.licenseNote")}</p>
        <p className={styles.author}>{t("common.author")}</p>
      </div>
    </footer>
  );
}
