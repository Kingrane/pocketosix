"use client";

import { useEffect, useRef } from "react";

export function useLandingReveal() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const regions = Array.from(root.querySelectorAll<HTMLElement>("[data-hero-ambient]"));
    const visibleRegions = new Set<HTMLElement>();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animating: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const suppressed = () => reduced.matches || document.hidden || root.hasAttribute("data-media-playing") || root.hasAttribute("data-launching");
    const syncAmbient = () => {
      const selected = !suppressed() && !animating ? regions.find((region) => visibleRegions.has(region)) : undefined;
      regions.forEach((region) => { region.dataset.motion = region === selected ? "running" : "paused"; });
      if (selected) root.setAttribute("data-ambient-playing", selected.dataset.ambientVariant!);
      else root.removeAttribute("data-ambient-playing");
    };
    const finish = () => {
      clearTimeout(timer);
      animating?.removeAttribute("data-reveal-active");
      animating = null;
      syncAmbient();
    };
    const reveal = (element: HTMLElement, animate = false) => {
      if (element.hasAttribute("data-revealed")) return;
      element.setAttribute("data-revealed", "");
      observer.unobserve(element);
      // A quick scroll can intersect several sections. Only one gets motion; the rest appear immediately.
      if (animate && !animating && !suppressed() && !root.hasAttribute("data-ambient-playing")) {
        animating = element;
        element.setAttribute("data-reveal-active", "");
        timer = setTimeout(finish, 180);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const target = entry.target as HTMLElement;
        if (!target.hasAttribute("data-hero-ambient")) return;
        if (entry.isIntersecting) visibleRegions.add(target);
        else visibleRegions.delete(target);
      });
      syncAmbient();
      entries.forEach((entry) => {
        if (entry.isIntersecting && !entry.target.hasAttribute("data-hero-ambient")) reveal(entry.target as HTMLElement, true);
      });
    }, { threshold: 0, rootMargin: "0px 0px -24px 0px" });
    const sync = () => {
      if (!suppressed()) {
        root.setAttribute("data-motion-ready", "");
        syncAmbient();
        return;
      }
      finish();
      // Video and route transitions suppress reveals; ambient only skips motion for intersecting sections.
      elements.forEach((element) => reveal(element));
      root.removeAttribute("data-motion-ready");
    };
    const revealFocused = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      elements.forEach((element) => { if (element.contains(target)) reveal(element); });
    };
    const mediaObserver = new MutationObserver(sync);

    regions.forEach((region) => {
      const bounds = region.getBoundingClientRect();
      if (bounds.top < window.innerHeight - 24 && bounds.bottom > 0) visibleRegions.add(region);
      observer.observe(region);
    });
    syncAmbient();
    elements.forEach((element) => {
      if (suppressed() || element.getBoundingClientRect().top < window.innerHeight) reveal(element);
      else observer.observe(element);
    });
    if (!suppressed()) root.setAttribute("data-motion-ready", "");
    mediaObserver.observe(root, { attributes: true, attributeFilter: ["data-media-playing", "data-launching"] });
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    root.addEventListener("focusin", revealFocused);
    return () => {
      finish();
      observer.disconnect();
      mediaObserver.disconnect();
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      root.removeEventListener("focusin", revealFocused);
      root.removeAttribute("data-motion-ready");
      root.removeAttribute("data-ambient-playing");
      regions.forEach((region) => { region.dataset.motion = "paused"; });
      elements.forEach((element) => element.removeAttribute("data-revealed"));
    };
  }, []);

  return rootRef;
}
