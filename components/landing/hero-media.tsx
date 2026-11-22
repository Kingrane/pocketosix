"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useLanguage } from "@/components/ui/language-provider";
import styles from "./landing.module.css";

export function HeroMedia({ hasImage, hasVideo }: { hasImage: boolean; hasVideo: boolean }) {
  const { t } = useLanguage();
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadVideo, setLoadVideo] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    const root = frame?.closest<HTMLElement>("[data-landing]");
    if (!hasVideo || !frame || !root || typeof IntersectionObserver === "undefined") return;

    const video = videoRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let failed = false;
    let active = true;
    const shouldPlay = () => visible && !document.hidden && !reduced.matches && !root.hasAttribute("data-launching") && !failed;
    const update = () => {
      if (!active) return;
      if (video) video.hidden = reduced.matches || failed;
      if (!shouldPlay()) {
        video?.pause();
        root.removeAttribute("data-media-playing");
      } else if (!video) {
        setLoadVideo(true);
      } else if (video.paused) {
        void video.play().catch((error: unknown) => {
          if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
          failed = true;
          root.removeAttribute("data-media-playing");
          video.hidden = true;
        });
      }
    };
    const playing = () => {
      if (shouldPlay()) root.setAttribute("data-media-playing", "");
      else video?.pause();
    };
    const paused = () => root.removeAttribute("data-media-playing");
    const errored = () => { failed = true; update(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: 0 });
    const launchObserver = new MutationObserver(update);
    observer.observe(frame);
    launchObserver.observe(root, { attributes: true, attributeFilter: ["data-launching"] });
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    video?.addEventListener("playing", playing);
    video?.addEventListener("pause", paused);
    video?.addEventListener("error", errored);
    return () => {
      active = false;
      observer.disconnect();
      launchObserver.disconnect();
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      video?.removeEventListener("playing", playing);
      video?.removeEventListener("pause", paused);
      video?.removeEventListener("error", errored);
      video?.pause();
      root.removeAttribute("data-media-playing");
    };
  }, [hasVideo, loadVideo]);

  return (
    <div className={styles.mediaWrap}>
      <div ref={frameRef} className={`${styles.mediaFrame}${hasImage ? ` ${styles.hasMedia}` : ""}`} data-hero-media>
        <div className={styles.windowBar} aria-hidden="true"><span /><span /><span /></div>
        <div className={styles.desktopMedia}>
          {hasImage ? (
            <Image src="/hero-desktop.png" alt={t("landing.hero.imageAlt")} width={1920} height={1200}
              sizes="(max-width: 1168px) calc(100vw - 48px), 1120px" loading="lazy" className={styles.desktopImage} />
          ) : (
            <div className={styles.mediaPending}>
              <ImageIcon size={24} strokeWidth={1.25} aria-hidden="true" />
              <p className={styles.mediaPendingTitle}>{t("landing.hero.mediaPendingTitle")}</p>
              <p>{t("landing.hero.mediaPendingDescription")}</p>
            </div>
          )}
          {hasVideo && loadVideo && (
            <video ref={videoRef} className={styles.desktopVideo} poster="/hero-desktop.png" muted loop playsInline preload="none"
              aria-label={t("landing.hero.videoAlt")}>
              <source src="/hero-desktop.webm" type="video/webm" />
              <source src="/hero-desktop.mp4" type="video/mp4" />
            </video>
          )}
        </div>
      </div>
    </div>
  );
}
