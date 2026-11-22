"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/components/ui/language-provider";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { SiteHeader } from "@/components/ui/site-header";
import styles from "./docs-page.module.css";

const topics = ["start", "keyboard", "storage", "network", "limits", "license"] as const;
const shortcuts = ["focus", "move", "split", "fullscreen", "close", "floating", "resize"] as const;

export function DocsPage() {
  const { locale, t } = useLanguage();

  return (
    <div className={styles.page} lang={locale}>
      <SiteHeader />
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <header className={styles.hero}>
          <h1>{t("common.docs")}</h1>
          <p className={styles.lead}>{t("docs.intro")}</p>
        </header>

        <div className={styles.layout}>
          <nav className={styles.index} aria-label={t("docs.contents")}>
            <p>{t("docs.contents")}</p>
            {topics.map((id) => <a key={id} href={`#${id}`}>{t(`docs.topics.${id}`)}</a>)}
          </nav>

          <article className={styles.article}>
            <section id="start" className={styles.section} aria-labelledby="start-heading" tabIndex={-1}>
              <h2 id="start-heading">{t("docs.topics.start")}</h2>
              <p>{t("docs.start.intro")}</p>
              <ol className={styles.steps}>
                {["launch", "focus", "terminal"].map((step) => <li key={step}>
                  <h3>{t(`docs.start.${step}.title`)}</h3>
                  <p>{t(`docs.start.${step}.detail`)}</p>
                </li>)}
              </ol>
              <Link href="/run" className="button button-primary">{t("common.launch")}<ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link>
              <p className={styles.caption}>{t("common.mobileNotice")}</p>
            </section>

            <section id="keyboard" className={styles.section} aria-labelledby="keyboard-heading" tabIndex={-1}>
              <h2 id="keyboard-heading">{t("docs.topics.keyboard")}</h2>
              <p>{t("docs.keyboard.intro")}</p>
              <div className={styles.tableWrap} role="region" aria-label={t("docs.keyboard.tableCaption")} tabIndex={0}>
                <table className={styles.shortcuts}>
                  <caption>{t("docs.keyboard.tableCaption")}</caption>
                  <thead><tr><th scope="col">{t("docs.keyboard.keys")}</th><th scope="col">{t("docs.keyboard.action")}</th></tr></thead>
                  <tbody>{shortcuts.map((shortcut) => <tr key={shortcut}>
                    <td><kbd>{t(`docs.keyboard.shortcuts.${shortcut}.keys`)}</kbd></td>
                    <td>{t(`docs.keyboard.shortcuts.${shortcut}.action`)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <p className={styles.caption}>{t("docs.keyboard.caveat")}</p>
              <h3>{t("docs.keyboard.ttyTitle")}</h3>
              <p>{t("docs.keyboard.tty")}</p>
              <h3>{t("docs.keyboard.inputTitle")}</h3>
              <p>{t("docs.keyboard.input")}</p>
              <a className={styles.textLink} href="https://github.com/leaningtech/alpine-image/blob/master/config/i3/config">{t("docs.keyboard.source")}<ArrowUpRight size={15} strokeWidth={1.5} aria-hidden="true" /></a>
            </section>

            <section id="storage" className={styles.section} aria-labelledby="storage-heading" tabIndex={-1}>
              <h2 id="storage-heading">{t("docs.topics.storage")}</h2>
              <p>{t("docs.storage.intro")}</p>
              <dl className={styles.facts}>
                {["saved", "session", "location", "quota"].map((fact) => <div key={fact}>
                  <dt>{t(`docs.storage.facts.${fact}.title`)}</dt>
                  <dd>{t(`docs.storage.facts.${fact}.detail`)}</dd>
                </div>)}
              </dl>
              <h3>{t("docs.storage.persistTitle")}</h3>
              <p>{t("docs.storage.persist")}</p>
              <h3>{t("docs.storage.lockTitle")}</h3>
              <p>{t("docs.storage.lock")}</p>
              <h3>{t("docs.storage.resetTitle")}</h3>
              <p>{t("docs.storage.reset")}</p>
              <aside className={styles.note} aria-labelledby="transfer-heading">
                <h3 id="transfer-heading">{t("docs.storage.transferTitle")}</h3>
                <p>{t("docs.storage.transfer")}</p>
              </aside>
            </section>

            <section id="network" className={styles.section} aria-labelledby="network-heading" tabIndex={-1}>
              <h2 id="network-heading">{t("docs.topics.network")}</h2>
              <p>{t("docs.network.intro")}</p>
              <ol className={styles.steps}>
                {["account", "exit", "check"].map((step) => <li key={step}>
                  <h3>{t(`docs.network.steps.${step}.title`)}</h3>
                  <p>{t(`docs.network.steps.${step}.detail`)}</p>
                </li>)}
              </ol>
              <h3>{t("docs.network.securityTitle")}</h3>
              <p>{t("docs.network.security")}</p>
              <a className={styles.textLink} href="https://tailscale.com/kb/1408/quick-guide-exit-nodes">{t("docs.network.source")}<ArrowUpRight size={15} strokeWidth={1.5} aria-hidden="true" /></a>
            </section>

            <section id="limits" className={styles.section} aria-labelledby="limits-heading" tabIndex={-1}>
              <h2 id="limits-heading">{t("docs.topics.limits")}</h2>
              <dl className={styles.facts}>
                {["compatibility", "dependencies", "browser", "accessibility"].map((fact) => <div key={fact}>
                  <dt>{t(`docs.limits.${fact}.title`)}</dt>
                  <dd>{t(`docs.limits.${fact}.detail`)}</dd>
                </div>)}
              </dl>
              <p>{t("docs.limits.isolation")}</p>
            </section>

            <section id="license" className={styles.section} aria-labelledby="license-heading" tabIndex={-1}>
              <h2 id="license-heading">{t("common.license")}</h2>
              <p>{t("docs.license.original")}</p>
              <p>{t("docs.license.sdk")}</p>
              <p>{t("docs.license.packages")}</p>
              <a className={styles.textLink} href="https://cheerpx.io/docs/licensing">{t("docs.license.source")}<ArrowUpRight size={15} strokeWidth={1.5} aria-hidden="true" /></a>
            </section>

            <footer className={styles.footer}>
              <div>
                <h2>{t("docs.sources.title")}</h2>
                <div className={styles.sources}>
                  <a href="https://cheerpx.io/docs/">{t("docs.sources.cheerpx")}</a>
                  <a href="https://github.com/leaningtech/alpine-image">{t("docs.sources.alpine")}</a>
                  <a href="https://github.com/leaningtech/webvm">{t("docs.sources.webvm")}</a>
                </div>
              </div>
              <LanguageSwitcher />
            </footer>
          </article>
        </div>
      </main>
    </div>
  );
}
