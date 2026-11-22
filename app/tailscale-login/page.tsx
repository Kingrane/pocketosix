"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/ui/site-header";
import { useLanguage } from "@/components/ui/language-provider";

export default function TailscaleLogin() {
  const { locale, t } = useLanguage();

  return (
    <div className="utility-page" lang={locale}>
      <SiteHeader compact />
      <main className="utility-main" id="main-content" tabIndex={-1}>
        <div className="utility-content">
          <h1>{t("utility.tailscale.title")}</h1>
          <p>{t("utility.tailscale.detail")}</p>
          <p className="utility-notice">{t("utility.tailscale.security")}</p>
          <p>{t("utility.tailscale.hint")}</p>
          <Link className="button button-secondary" href="/docs#network" target="_blank" rel="noopener noreferrer">{t("utility.tailscale.docs")}<ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link>
        </div>
      </main>
    </div>
  );
}
