"use client";

import Image from "next/image";
import { SiteHeader } from "@/components/ui/site-header";
import { SiteFooter } from "@/components/ui/site-footer";
import { LaunchLink } from "@/components/ui/launch-link";
import { useLanguage } from "@/components/ui/language-provider";
import { GITHUB_URL } from "@/lib/site-links";
import { useLandingReveal } from "@/hooks/use-landing-reveal";
import { LANDING_FEATURES, LANDING_STATS, type LandingFeatureMedia } from "@/lib/landing-config";
import { HeroMedia } from "./hero-media";
import { HeroAmbient } from "./hero-ambient";
import styles from "./landing.module.css";
import motion from "./landing-motion.module.css";

const architecture = ["browser", "cheerpx", "alpine", "desktop", "canvas"] as const;
const notes = ["compatibility", "storage", "network"] as const;

export function Landing({ hasDesktopMedia = false, hasDesktopVideo = false, featureMedia = {} }: {
  hasDesktopMedia?: boolean;
  hasDesktopVideo?: boolean;
  featureMedia?: LandingFeatureMedia;
}) {
  const { t } = useLanguage();
  const landingRef = useLandingReveal();

  return (
    <div ref={landingRef} className={`${styles.landing} ${motion.motion}`} data-landing>
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

          <HeroMedia hasImage={hasDesktopMedia} hasVideo={hasDesktopVideo} />
        </section>

        <dl className={styles.stats} aria-label={t("landing.stats.label")}>
          {Object.entries(LANDING_STATS).map(([key, value]) => (
            <div key={key}>
              <dt>{t(`landing.stats.${key}`)}</dt>
              <dd>{value === null ? <><span aria-hidden="true">—</span><span className="sr-only">{t("landing.stats.notMeasured")}</span></> : value}</dd>
            </div>
          ))}
        </dl>

        <section className={styles.features} aria-label={t("landing.features.label")} data-reveal>
          {LANDING_FEATURES.map(({ key, image }) => (
            <article className={styles.feature} key={key}>
              <div className={styles.featureMedia}>
                {featureMedia[key] ? (
                  <Image src={image} alt={t(`landing.features.${key}.imageAlt`)} fill
                    sizes="(max-width: 640px) calc(100vw - 40px), (max-width: 1168px) calc((100vw - 96px) / 3), 357px" loading="lazy" />
                ) : (
                  <div className={styles.featurePlaceholder}>
                    <span className={styles.placeholderLabel}>{t("landing.features.capturePending")}</span>
                    <span>{t(`landing.features.${key}.placeholder`)}</span>
                  </div>
                )}
              </div>
              <div className={styles.featureCopy}>
                <h2>{t(`landing.features.${key}.title`)}</h2>
                <p>{t(`landing.features.${key}.description`)}</p>
              </div>
            </article>
          ))}
        </section>

        <section className={styles.architecture} aria-labelledby="architecture-heading" data-surface="architecture" data-reveal>
          <HeroAmbient variant="section" />
          <h2 id="architecture-heading">{t("landing.architecture.title")}</h2>
          <ol className={styles.nodes}>
            {architecture.map((key) => (
              <li key={key}>
                <span>{t(`landing.architecture.nodes.${key}`)}</span>
                {key === "cheerpx" && <small>{t("landing.architecture.translation")}</small>}
              </li>
            ))}
          </ol>
          <p>{t("landing.architecture.description")}</p>
        </section>

        <section className={styles.goodToKnow} aria-labelledby="notes-heading" data-surface="notes" data-reveal>
          <h2 id="notes-heading">{t("landing.notes.title")}</h2>
          <dl className={styles.noteList}>
            {notes.map((key) => (
              <div className={styles.note} key={key}>
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
