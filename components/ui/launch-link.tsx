"use client";

import { useId, useRef } from "react";
import Link from "next/link";
import { useLanguage } from "./language-provider";
import styles from "@/components/landing/site-chrome.module.css";

export function LaunchLink({ className = "button button-primary" }: { className?: string }) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const noticeId = useId();

  return (
    <>
      <Link ref={trigger} href="/run" prefetch={false} className={className} onClick={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !window.matchMedia("(max-width: 767px)").matches) return;
        event.preventDefault();
        dialog.current?.showModal();
      }}>{t("common.launch")}</Link>
      <dialog ref={dialog} className={styles.mobileDialog} aria-labelledby={noticeId} onClose={() => trigger.current?.focus()}>
        <p id={noticeId}>{t("common.mobileNotice")}</p>
        <div className={styles.mobileActions}>
          <button type="button" className="button button-secondary" autoFocus onClick={() => dialog.current?.close()}>{t("common.cancel")}</button>
          <Link href="/run" prefetch={false} className="button button-primary" onClick={() => dialog.current?.close()}>{t("common.launch")}</Link>
        </div>
      </dialog>
    </>
  );
}
