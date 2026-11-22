import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { useLanguage } from "@/components/ui/language-provider";
import type { WebVMSnapshot } from "@/lib/webvm-state";
import type { DialogName } from "./desktop-toolbar";
import styles from "./desktop-shell.module.css";

function Modal({ open = true, title, drawer = false, busy = false, onClose, children }: { open?: boolean; title: string; drawer?: boolean; busy?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useLanguage();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
    return () => { if (dialog?.open) dialog.close(); };
  }, [open]);
  return <dialog ref={ref} className={`${styles.dialog} ${drawer ? styles.drawer : ""}`} aria-label={title}
    onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className={styles.dialogBody}><div className={styles.dialogTop}><h2>{title}</h2><button className="icon-button" disabled={busy} aria-label={t("common.close")} onClick={onClose}><X size={18} aria-hidden="true" /></button></div>{children}</div>
  </dialog>;
}

export function DesktopLogs({ open, consoleRef, onClose }: { open: boolean; consoleRef: RefObject<HTMLPreElement | null>; onClose: () => void }) {
  const { t } = useLanguage();
  // Keep this pre mounted from the first render: the existing adapter owns it.
  return <Modal open={open} title={t("run.logsTitle")} onClose={onClose}><p className={styles.note}>{t("run.logsDescription")}</p><pre ref={consoleRef} className={`system-console ${styles.systemConsole}`} tabIndex={0} /></Modal>;
}

type Props = {
  name: Exclude<DialogName, "logs" | null>; snapshot: WebVMSnapshot; scale: "fit" | "native";
  pointerLockAvailable: boolean; terminalOpen: boolean; onScale: (scale: "fit" | "native") => void;
  onPointerLock: () => void; onTerminal: () => void; onClose: () => void; onDialog: (name: DialogName) => void;
  onConnect: () => void; onProtect: () => Promise<void>; onReset: () => Promise<void>;
};

export function DesktopDialog({ name, snapshot, scale, pointerLockAvailable, terminalOpen, onScale, onPointerLock, onTerminal, onClose, onDialog, onConnect, onProtect, onReset }: Props) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const confirm = name === "reset" || name === "reboot";
  const title = t(name === "reset" ? "run.resetTitle" : name === "reboot" ? "run.restartTitle" : "run.menuTitle");
  useEffect(() => {
    if (name === "menu" || confirm) return;
    const frame = requestAnimationFrame(() => sectionRef.current?.querySelector(`[data-section="${name}"]`)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [name, confirm]);
  async function operation(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try { await action(); } catch (error) { setActionError(String(error)); } finally { setBusy(false); }
  }
  function storageValue(value: number | null) {
    if (value === null) return t("run.unavailable");
    const units = ["bytes", "kib", "mib", "gib"];
    const index = value ? Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3) : 0;
    return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${t(`run.units.${units[index]}`)}`;
  }
  const ready = snapshot.phase === "ready";
  const connecting = snapshot.network.phase === "connecting" || snapshot.network.phase === "login";
  return <Modal title={title} drawer={!confirm} busy={busy} onClose={onClose}>
    {name === "reboot" ? <>
      <p>{t("run.restartDescription")}</p><p className={styles.note}>{t("run.restartNextBoot")}</p>
      <div className={styles.dialogFooter}><button className="button button-secondary" onClick={onClose}>{t("common.cancel")}</button><button className="button button-primary" onClick={() => window.location.reload()}>{t("run.restart")}</button></div>
    </> : name === "reset" ? <>
      <p className={styles.danger}>{t("run.resetDescription")}</p><p className={styles.note}>{t("run.resetNextBoot")}</p>
      <label className={styles.confirmLabel} htmlFor="reset-confirm">{t("run.resetConfirmation")}</label>
      <input id="reset-confirm" className={styles.confirmInput} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy} />
      <div className={styles.dialogFooter}><button className="button button-secondary" disabled={busy} onClick={onClose}>{t("run.keepDisk")}</button><button className={`button ${styles.dangerButton}`} onClick={() => void operation(onReset)} disabled={confirmation !== "pocketosix" || busy || !ready}>{t(busy ? "run.resetPending" : "run.deleteDisk")}</button></div>
    </> : <div ref={sectionRef}>
      <section className={styles.drawerSection}><h3>{t("run.displayTitle")}</h3>
        <div className={styles.segmented} role="group" aria-label={t("run.scaleTitle")}><button aria-pressed={scale === "fit"} onClick={() => onScale("fit")}>{t("run.fit")}</button><button aria-pressed={scale === "native"} onClick={() => onScale("native")}>{t("run.native")}</button></div>
        <button className="button button-secondary" onClick={onPointerLock} disabled={!ready || !pointerLockAvailable}>{t("run.pointerLock")}</button>
        <small>{t(!pointerLockAvailable ? "run.pointerLockUnavailable" : !ready ? "run.afterBoot" : "run.pointerLockHint")}</small>
      </section>
      <section className={styles.drawerSection}><h3>{t("run.terminalTitle")}</h3><p>{t("run.terminalDescription")}</p>
        <button className="button button-secondary" disabled={!snapshot.consoleReady} onClick={onTerminal}>{t(terminalOpen ? "run.returnTerminal" : "run.openTerminal")}</button>
        {!snapshot.consoleReady && <small>{t("run.consoleUnavailable")}</small>}
      </section>
      <section className={styles.drawerSection} data-section="storage"><h3>{t("run.diskTitle")}</h3><p>{t("run.diskDescription")}</p>
        <dl className={styles.metrics}><div><dt>{t("run.originUsage")}</dt><dd>{storageValue(snapshot.storage.usage)}</dd></div><div><dt>{t("run.quota")}</dt><dd>{storageValue(snapshot.storage.quota)}</dd></div><div><dt>{t("run.protection")}</dt><dd>{t(!snapshot.storage.checked ? "run.unavailable" : snapshot.storage.persistent ? "run.granted" : "run.notGranted")}</dd></div></dl>
        <button className="button button-secondary" onClick={() => void operation(onProtect)} disabled={busy || snapshot.storage.persistent || !snapshot.storage.checked}>{t(busy ? "run.requesting" : snapshot.storage.persistent ? "run.storageProtected" : "run.protectStorage")}</button>
        <small>{t(!snapshot.storage.checked ? "run.storageUnavailable" : snapshot.storage.persistent ? "run.protectionGranted" : "run.storageLimits")}</small>
        <div className={styles.diskActions}><button className={styles.textButton} onClick={() => onDialog("reboot")}>{t("run.restart")}</button><button className={`${styles.textButton} ${styles.danger}`} disabled={!ready} onClick={() => onDialog("reset")}>{t("run.resetDisk")}</button></div>
        {!ready && <small>{t("run.resetUnavailable")}</small>}
      </section>
      <section className={styles.drawerSection} data-section="network"><h3>{t("run.networkTitle")}</h3><p>{t("run.networkDescription")}</p>
        <dl className={styles.metrics}><div><dt>{t("run.tailscale")}</dt><dd>{t(`run.networkStates.${snapshot.network.phase}`)}</dd></div><div><dt>{t("run.ip")}</dt><dd>{snapshot.network.ip ?? t("run.unavailable")}</dd></div><div><dt>{t("run.exitNode")}</dt><dd>{t(snapshot.network.exitNode ? "run.exitDetected" : "run.exitNotDetected")}</dd></div></dl>
        {snapshot.network.loginUrl ? <a className="button button-secondary" href={snapshot.network.loginUrl} target="_blank" rel="noopener noreferrer">{t("run.continueLogin")}<ArrowUpRight size={14} aria-hidden="true" /></a> : snapshot.network.phase === "connected" ? <small>{t("run.disconnectHint")}</small> : <><button className="button button-secondary" onClick={onConnect} disabled={!ready || connecting}>{t(connecting ? "run.connecting" : "run.connectTailscale")}</button>{(!ready || connecting) && <small>{t(!ready ? "run.afterBoot" : "run.loginPending")}</small>}</>}
        <a className={styles.externalLink} href="https://tailscale.com/kb/1408/quick-guide-exit-nodes" target="_blank" rel="noopener noreferrer">{t("run.exitGuide")}<ArrowUpRight size={14} aria-hidden="true" /></a>
        {snapshot.network.error && <div role="alert"><p>{t("run.networkError")}</p><details className={styles.technical}><summary>{t("run.technicalDetails")}</summary><pre>{snapshot.network.error}</pre></details></div>}
      </section>
      <section className={styles.drawerSection} data-section="help"><h3>{t("run.shortcutsTitle")}</h3><p>{t("run.inputHint")}</p><small>{t("run.modifier")}</small>
        <dl className={styles.shortcuts}>{["terminal", "launcher", "workspaces", "close"].map((key) => <div key={key}><dt><kbd>{t(`run.shortcuts.${key}.keys`)}</kbd></dt><dd>{t(`run.shortcuts.${key}.description`)}</dd></div>)}</dl>
      </section>
      <section className={styles.drawerSection}><h3>{t("run.logsTitle")}</h3><button className={styles.textButton} onClick={() => onDialog("logs")}>{t("run.showLogs")}</button></section>
      <section className={`${styles.drawerSection} ${styles.languageSection}`}><h3>{t("run.languageTitle")}</h3><LanguageSwitcher /></section>
      <nav className={styles.drawerLinks} aria-label={t("run.navigation")}><Link href="/">{t("run.home")}</Link><Link href="/docs">{t("common.docs")}</Link></nav>
    </div>}
    {(actionError || snapshot.operationError) && <div role="alert"><p>{t(snapshot.operationError?.startsWith("Браузер не разрешил защиту") ? "run.protectionDenied" : "run.operationError")}</p><details className={styles.technical}><summary>{t("run.technicalDetails")}</summary><pre>{actionError || snapshot.operationError}</pre></details></div>}
  </Modal>;
}
