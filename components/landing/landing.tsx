"use client";

import Image from "next/image";
import { Cpu, HardDrive, ImageIcon, Terminal } from "lucide-react";
import { SiteHeader } from "@/components/ui/site-header";
import { SiteFooter } from "@/components/ui/site-footer";
import { LaunchLink } from "@/components/ui/launch-link";
import { useLanguage } from "@/components/ui/language-provider";
import { GITHUB_URL } from "@/lib/site-links";
import { useLandingReveal } from "@/hooks/use-landing-reveal";
import { HeroAmbient } from "./hero-ambient";
import styles from "./landing.module.css";
import motion from "./landing-motion.module.css";

const features = [
  { key: "userspace", Icon: Terminal },
  { key: "disk", Icon: HardDrive },
  { key: "compute", Icon: Cpu },
] as const;
const architecture = ["browser", "cheerpx", "alpine", "desktop", "canvas"] as const;
const notes = ["compatibility", "storage", "network"] as const;

export function Landing({ hasDesktopMedia = false }: { hasDesktopMedia?: boolean }) {
  const { t } = useLanguage();
  const landingRef = useLandingReveal();

  return (
    <div ref={landingRef} className={`${styles.landing} ${motion.motion}`}>
      <SiteHeader />
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <HeroAmbient />
          <div className={styles.heroCopy}>
            <h1 id="hero-heading">{t("landing.hero.title")}</h1>
            <p className={styles.heroIntro}>{t("landing.hero.description")}</p>
            <div className={styles.actions}>
              <LaunchLink className="button button-primary button-large" />
              <a href={GITHUB_URL} className="button button-secondary button-large">{t("common.github")}</a>
            </div>
            <p className={styles.caption}>{t("landing.hero.caption")}</p>
          </div>

          <div className={styles.mediaWrap}>
            <div className={`${styles.mediaFrame}${hasDesktopMedia ? ` ${styles.hasMedia}` : ""}`}>
              <div className={styles.windowBar} aria-hidden="true"><span /><span /><span /></div>
              <div className={styles.desktopMedia}>
                {hasDesktopMedia ? (
                  <Image
                    src="/hero-desktop.png"
                    alt={t("landing.hero.imageAlt")}
                    width={1920}
                    height={1200}
                    sizes="(max-width: 1168px) calc(100vw - 48px), 1120px"
                    loading="lazy"
                    className={styles.desktopImage}
                  />
                ) : (
                  <div className={styles.mediaPending}>
                    <ImageIcon size={24} strokeWidth={1.25} aria-hidden="true" />
                    <p className={styles.mediaPendingTitle}>{t("landing.hero.mediaPendingTitle")}</p>
                    <p>{t("landing.hero.mediaPendingDescription")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.features} aria-label={t("landing.features.label")}>
          {features.map(({ key, Icon }) => (
            <article className={styles.feature} key={key} data-reveal>
              <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
              <h2>{t(`landing.features.${key}.title`)}</h2>
              <p>{t(`landing.features.${key}.description`)}</p>
            </article>
          ))}
        </section>

        <section className={styles.architecture} aria-labelledby="architecture-heading" data-surface="architecture">
          <h2 id="architecture-heading" data-reveal>{t("landing.architecture.title")}</h2>
          <ol className={styles.nodes} data-reveal>
            {architecture.map((key) => (
              <li key={key}>
                <span>{t(`landing.architecture.nodes.${key}`)}</span>
                {key === "cheerpx" && <small>{t("landing.architecture.translation")}</small>}
              </li>
            ))}
          </ol>
          <p data-reveal>{t("landing.architecture.description")}</p>
        </section>

        <section className={styles.goodToKnow} aria-labelledby="notes-heading" data-surface="notes">
          <h2 id="notes-heading" data-reveal>{t("landing.notes.title")}</h2>
          <dl className={styles.noteList}>
            {notes.map((key) => (
              <div className={styles.note} key={key} data-reveal>
                <dt>{t(`landing.notes.${key}.title`)}</dt>
                <dd>{t(`landing.notes.${key}.description`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.finalCta} aria-labelledby="launch-heading" data-surface="cta" data-reveal>
          <h2 id="launch-heading">{t("landing.finalCta")}</h2>
          <LaunchLink className="button button-primary button-large" />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
