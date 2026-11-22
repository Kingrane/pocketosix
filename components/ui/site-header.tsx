"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen } from "lucide-react";
import { GITHUB_URL } from "@/lib/site-links";
import { Logo } from "./logo";
import { useLanguage } from "./language-provider";
import { LanguageSwitcher } from "./language-switcher";
import { LaunchLink } from "./launch-link";
import styles from "@/components/landing/site-chrome.module.css";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const updateBorder = () => {
      if (header.current) header.current.dataset.scrolled = String(window.scrollY > 0);
    };
    updateBorder();
    window.addEventListener("scroll", updateBorder, { passive: true });
    return () => window.removeEventListener("scroll", updateBorder);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content">{t("common.skip")}</a>
      <header ref={header} className={`site-header ${styles.header}${compact ? " site-header-compact" : ""}`}>
        <Link className="site-brand" href="/" aria-label={t("common.home")}><Logo /></Link>
        <nav className={`site-nav ${styles.navigation}`} aria-label={t("landing.navigation")}>
          <Link className={styles.navDocs} href="/docs" aria-label={t("common.docs")} aria-current={pathname?.startsWith("/docs") ? "page" : undefined}>
            <BookOpen className={styles.docsIcon} size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className={styles.docsText}>{t("common.docs")}</span>
          </Link>
          <a className="nav-github" href={GITHUB_URL}>{t("common.github")}</a>
          <LanguageSwitcher />
          <LaunchLink />
        </nav>
      </header>
    </>
  );
}
