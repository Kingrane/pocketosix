"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/components/ui/language-provider";
import type { WebVMSnapshot } from "@/lib/webvm-state";
import styles from "./desktop-panel.module.css";

type ModalProps = {
  title: string; onClose: () => void; children: ReactNode; busy?: boolean;
  closeOnEscape?: boolean; closeOnBackdrop?: boolean;
};

export function DesktopModal({ title, onClose, children, busy = false, closeOnEscape = true, closeOnBackdrop = true }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useLanguage();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector<HTMLElement>("[data-autofocus]:not(:disabled), [autofocus]:not(:disabled)") ?? dialog.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex='0']");
    first?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className={styles.modal} aria-labelledby={titleId} aria-busy={busy}
    onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (closeOnEscape && !busy) onClose(); }}
    onClick={(event) => {
      if (!closeOnBackdrop || busy || event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className={styles.modalBody}>
      <header className={styles.modalHeader}><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" disabled={busy} aria-label={t("common.close")} onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
      {children}
    </div>
  </dialog>;
}

type ConfirmProps = {
  name: "reset" | "reboot" | "leave"; snapshot: WebVMSnapshot;
  onClose: () => void; onReset: () => Promise<void>; onLeave: () => void;
};

export function DesktopConfirm(props: ConfirmProps) {
  return <ConfirmDialog key={props.name} {...props} />;
}

function ConfirmDialog({ name, snapshot, onClose, onReset, onLeave }: ConfirmProps) {
  const { t } = useLanguage();
  const inputId = useId();
  const warningId = useId();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = snapshot.phase === "ready";
  const leave = name === "leave";
  async function reset() {
    if (busy || !ready || confirmation !== "pocketosix") return;
    setBusy(true);
    setError(null);
    try { await onReset(); } catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  }
  return <DesktopModal title={t(name === "reset" ? "run.resetTitle" : leave ? "run.leaveTitle" : "run.restartTitle")}
    onClose={onClose} busy={busy} closeOnEscape={!leave} closeOnBackdrop={!leave}>
    {name === "reset" ? <>
      <p id={warningId} className={styles.danger}>{t("run.resetDescription")}</p>
      <p className={styles.helper}>{t("run.resetNextBoot")}</p>
      <label className={styles.confirmLabel} htmlFor={inputId}>{t("run.resetConfirmation")}</label>
      <input id={inputId} className={styles.confirmInput} value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
        aria-describedby={warningId} autoFocus data-autofocus autoComplete="off" spellCheck={false} disabled={busy} />
      <div className={styles.footer}><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>{t("run.keepDisk")}</button><button type="button" className={`button ${styles.dangerButton}`} disabled={busy || !ready || confirmation !== "pocketosix"} onClick={() => void reset()}>{t(busy ? "run.resetPending" : "run.deleteDisk")}</button></div>
    </> : leave ? <>
      <p>{t("run.leaveDescription")}</p>
      <p className={styles.helper}>{t("run.leaveWriteWarning")}</p>
      <div className={styles.footer}><button type="button" className="button button-secondary" autoFocus data-autofocus onClick={onClose}>{t("run.stay")}</button><button type="button" className="button button-primary" onClick={onLeave}>{t("run.leave")}</button></div>
    </> : <>
      <p>{t("run.restartDescription")}</p><p className={styles.helper}>{t("run.restartNextBoot")}</p>
      <div className={styles.footer}><button type="button" className="button button-secondary" autoFocus data-autofocus onClick={onClose}>{t("common.cancel")}</button><button type="button" className="button button-primary" disabled={!ready} onClick={() => window.location.reload()}>{t("run.restart")}</button></div>
    </>}
    {(error || (name === "reset" && snapshot.operationError)) && <div className={styles.error} role="alert"><p>{t("run.operationError")}</p><details className={styles.details}><summary>{t("run.technicalDetails")}</summary><pre>{error || snapshot.operationError}</pre></details></div>}
  </DesktopModal>;
}
