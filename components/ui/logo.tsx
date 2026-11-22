"use client";

import { useId } from "react";

type LogoProps = {
  variant?: "full" | "mark" | "mono";
  className?: string;
};

export function Logo({ variant = "full", className = "" }: LogoProps) {
  const id = useId();
  const hex = `${id}-hex`;
  const cut = `${id}-cut`;

  return (
    <span className={`logo logo-${variant} ${className}`.trim()}>
      <svg className="logo-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="32" height="32" role="img" aria-label="pocketosix">
        <defs>
          <clipPath id={hex}>
            <path d="M128 16 L225 72 V184 L128 240 L31 184 V72 Z" />
          </clipPath>
          <mask id={cut}>
            <rect width="256" height="256" fill="#fff" />
            <path d="M58 94 L100 128 L58 162" fill="none" stroke="#000" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
            <rect className="logo-cursor" x="156" y="180" width="38" height="13" rx="3" fill="#000" />
          </mask>
        </defs>
        <g clipPath={`url(#${hex})`} mask={`url(#${cut})`}>
          <rect x="0" y="0" width="124" height="256" fill="currentColor" />
          <rect x="132" y="0" width="124" height="124" fill="currentColor" opacity="0.45" />
          <rect x="132" y="132" width="124" height="124" fill="currentColor" />
        </g>
      </svg>
      {variant === "full" && <span className="logo-word" aria-hidden="true">pocketosix</span>}
    </span>
  );
}
