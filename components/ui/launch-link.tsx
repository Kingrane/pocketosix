"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "./language-provider";
import styles from "@/components/landing/site-chrome.module.css";

export function LaunchLink({ className = "button button-primary" }: { className?: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const transitionRoot = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const noticeId = useId();
  const descriptionId = useId();

  useEffect(() => () => {
    clearTimeout(timer.current);
    clearTimeout(recoveryTimer.current);
    transitionRoot.current?.removeAttribute("data-launching");
  }, []);

  const launch = (event: { preventDefault: () => void }) => {
    const root = trigger.current?.closest<HTMLElement>("[data-landing]");
    if (pending.current || root?.hasAttribute("data-launching")) {
      event.preventDefault();
      return;
    }
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.current?.close();
      return;
    }
    event.preventDefault();
    pending.current = true;
    transitionRoot.current = root;
    root.setAttribute("data-launching", "");
    root.querySelectorAll("video").forEach((video) => video.pause());
    dialog.current?.close();
    setLeaving(true);
    timer.current = setTimeout(() => {
      router.push("/run");
      // A stalled route must not leave a permanent scrim over the page.
      recoveryTimer.current = setTimeout(() => {
        root.removeAttribute("data-launching");
        pending.current = false;
        setLeaving(false);
        trigger.current?.focus();
      }, 3000);
    }, 180);
  };

  return (
    <>
      <Link ref={trigger} href="/run" prefetch={false} className={className} onClick={(event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !window.matchMedia("(max-width: 767px)").matches) return;
        event.preventDefault();
        dialog.current?.showModal();
      }} onNavigate={launch}>{t("common.launch")}</Link>
      <dialog ref={dialog} className={styles.mobileDialog} aria-labelledby={noticeId} aria-describedby={descriptionId}
        onClose={() => { if (!pending.current) trigger.current?.focus(); }}>
        <h2 id={noticeId}>{t("landing.launch.mobileTitle")}</h2>
        <p id={descriptionId}>{t("common.mobileNotice")}</p>
        <div className={styles.mobileActions}>
          <button type="button" className="button button-secondary" autoFocus onClick={() => dialog.current?.close()}>{t("common.cancel")}</button>
          <Link href="/run" prefetch={false} className="button button-primary" onNavigate={launch}>{t("common.launch")}</Link>
        </div>
      </dialog>
      {leaving && createPortal(<div className={styles.launchTransition} data-launch-transition role="status" aria-live="polite">
        <span>{t("landing.launch.opening")}</span>
      </div>, document.body)}
    </>
  );
}
