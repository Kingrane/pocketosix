"use client";

import { useId } from "react";
import styles from "./hero-ambient.module.css";

// Original brand mark and CSS 3D planes; the landing hook owns the active motion region.
export function HeroAmbient({ variant = "hero" }: { variant?: "hero" | "section" }) {
  const id = useId();
  const mark = `${id}-mark`;
  const hex = `${id}-hex`;
  const cut = `${id}-cut`;
  const dither = `${id}-dither`;
  const positions = variant === "hero" ? [styles.one, styles.two, styles.three, styles.four] : [styles.one, styles.two];

  return <div className={`${styles.ambient}${variant === "section" ? ` ${styles.section}` : ""}`} aria-hidden="true" data-motion="paused" data-hero-ambient data-ambient-variant={variant}>
    <svg className={styles.definitions} xmlns="http://www.w3.org/2000/svg" focusable="false">
      <defs>
        <clipPath id={hex}><path d="M128 16 L225 72 V184 L128 240 L31 184 V72 Z" /></clipPath>
        <mask id={cut}>
          <rect width="256" height="256" fill="white" />
          <path d="M58 94 L100 128 L58 162" fill="none" stroke="black" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="156" y="180" width="38" height="13" rx="3" fill="black" />
        </mask>
        <pattern id={dither} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="1.5" height="1.5" fill="#08090a" />
          <rect x="3" y="3" width="1.5" height="1.5" fill="#08090a" />
        </pattern>
        <symbol id={mark} viewBox="0 0 256 256">
          <g clipPath={`url(#${hex})`} mask={`url(#${cut})`}>
            <rect width="124" height="256" fill="currentColor" />
            <rect x="132" width="124" height="124" fill="currentColor" opacity=".45" />
            <rect x="132" y="132" width="124" height="124" fill="currentColor" />
          </g>
        </symbol>
      </defs>
    </svg>
    {positions.map(position => <div className={`${styles.item} ${position}`} key={position}>
      <div className={styles.float} data-ambient-float>
        {[-12, -8, -4, 0].map(depth => <svg key={depth} className={`${styles.face} ${depth === 0 ? styles.front : styles.edge}`} viewBox="0 0 256 256" focusable="false" style={{ transform: `translateZ(${depth}px)` }}>
          <use href={`#${mark}`} />
          {depth === 0 && <rect width="256" height="256" fill={`url(#${dither})`} clipPath={`url(#${hex})`} mask={`url(#${cut})`} opacity=".7" />}
        </svg>)}
      </div>
    </div>)}
  </div>;
}
