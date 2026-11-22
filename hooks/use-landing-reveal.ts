"use client";

import { useEffect, useRef } from "react";

export function useLandingReveal() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window.matchMedia !== "function" || typeof IntersectionObserver === "undefined") return;

    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | null = null;
    let active = true;

    const reveal = (element: HTMLElement) => {
      element.setAttribute("data-revealed", "");
      observer?.unobserve(element);
    };
    const syncMotion = () => {
      observer?.disconnect();
      observer = null;
      root.removeAttribute("data-motion-ready");

      if (reducedMotion.matches) {
        elements.forEach(reveal);
        return;
      }

      observer = new IntersectionObserver((entries) => {
        if (!active || reducedMotion.matches) return;
        entries.forEach((entry) => {
          if (entry.isIntersecting) reveal(entry.target as HTMLElement);
        });
      }, { threshold: 0, rootMargin: "0px 0px -24px 0px" });

      elements.forEach((element) => {
        // Keep already visible SSR content visible when hydration starts.
        if (element.getBoundingClientRect().top < window.innerHeight) reveal(element);
        else if (!element.hasAttribute("data-revealed")) observer?.observe(element);
      });
      root.setAttribute("data-motion-ready", "");
    };
    const revealFocused = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      elements.forEach((element) => {
        if (element.contains(target)) reveal(element);
      });
    };

    syncMotion();
    reducedMotion.addEventListener("change", syncMotion);
    root.addEventListener("focusin", revealFocused);
    return () => {
      active = false;
      observer?.disconnect();
      reducedMotion.removeEventListener("change", syncMotion);
      root.removeEventListener("focusin", revealFocused);
      root.removeAttribute("data-motion-ready");
      elements.forEach((element) => element.removeAttribute("data-revealed"));
    };
  }, []);

  return rootRef;
}
