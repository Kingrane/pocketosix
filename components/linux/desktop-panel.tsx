"use client";

import { useId, useState, type RefObject } from "react";
import { ArrowUpRight, Copy, X } from "lucide-react";
import { useLanguage } from "@/components/ui/language-provider";
import { MENU_CHORD, type DialogName, type PanelName } from "@/lib/desktop-ui";
import type { WebVMSnapshot } from "@/lib/webvm-state";
import styles from "./desktop-panel.module.css";
import { GuestDesktopControls, type GuestControlProps } from "./guest-desktop-controls";

type Props = {
  name: PanelName | null; snapshot: WebVMSnapshot; scale: "fit" | "native";
  pointerLockAvailable: boolean; terminalOpen: boolean; consoleRef: RefObject<HTMLPreElement | null>;
  onClose: () => void; onScale: (scale: "fit" | "native") => void; onPointerLock: () => void; onTerminal: () => void;
  onDialog: (name: DialogName) => void; onConnect: () => void; onProtect: () => Promise<void>;
  guestControls: Omit<GuestControlProps, "guest" | "ready">;
};

function Keys({ value }: { value: string }) {
  return <span className={styles.keys}>{value.split(" + ").map((key, index) => <span className={styles.keyPart} key={`${index}-${key}`}>{index > 0 && <span className={styles.plus} aria-hidden="true">+</span>}<kbd>{key}</kbd></span>)}</span>;
}

export function DesktopPanel({ name, snapshot, scale, pointerLockAvailable, terminalOpen, consoleRef, onClose, onScale, onPointerLock, onTerminal, onDialog, onConnect, onProtect, guestControls }: Props) {
  const { t } = useLanguage();
  const id = useId();
  const [protecting, setProtecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"copied" | "denied" | null>(null);
  const ready = snapshot.phase === "ready";
  const connecting = snapshot.network.phase === "connecting" || snapshot.network.phase === "login";
  const operationError = actionError || snapshot.operationError;
  function storageValue(value: number | null) {
    if (value === null) return t("run.unavailable");
    const units = ["bytes", "kib", "mib", "gib"];
    const index = value > 0 ? Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3) : 0;
    return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${t(`run.units.${units[index]}`)}`;
  }
  async function protect() {
    if (protecting || snapshot.storage.persistent || !snapshot.storage.checked) return;
    setProtecting(true);
    setActionError(null);
    try { await onProtect(); } catch (error) { setActionError(String(error)); } finally { setProtecting(false); }
  }
  async function copyLogs() {
    const text = consoleRef.current?.textContent;
    if (text === undefined || text === null) return;
    try { await navigator.clipboard.writeText(text); setCopyState("copied"); } catch { setCopyState("denied"); }
  }
  function learnMore(topic: "keyboard" | "storage" | "network") {
    return <a className={styles.link} href={`/docs#${topic}`} target="_blank" rel="noopener noreferrer">{t("run.learnMore")}<ArrowUpRight size={13} aria-hidden="true" /></a>;
  }
  const guestShortcuts = [
    ...["terminal", "launcher", "workspaces", "close"].map((key) => ({ keys: `run.shortcuts.${key}.keys`, action: `run.shortcuts.${key}.description` })),
    ...["fullscreen", "floating", "resize"].map((key) => ({ keys: `docs.keyboard.shortcuts.${key}.keys`, action: `docs.keyboard.shortcuts.${key}.action` })),
  ];
  return <div className={styles.panel}>
    <header className={styles.panelHeader}><h2 id={`${id}-title`}>{t(name ? `run.${name}Title` : "run.panel")}</h2><button type="button" className={styles.closeButton} data-panel-close aria-label={t("run.closePanel")} title={t("run.closePanel")} onClick={onClose}><X size={16} aria-hidden="true" /><span>{t("common.close")}</span></button></header>
    <section hidden={!name || name === "logs"} className={styles.content} aria-labelledby={`${id}-title`}>
      {name === "apps" && <GuestDesktopControls guest={snapshot.guestDesktop} ready={ready} {...guestControls} />}
      {name === "display" && <>
        <div className={styles.segmented} role="group" aria-label={t("run.scaleTitle")}><button type="button" aria-pressed={scale === "fit"} onClick={() => onScale("fit")}>{t("run.fit")}</button><button type="button" aria-pressed={scale === "native"} onClick={() => onScale("native")}>{t("run.native")}</button></div>
        <button type="button" className="button button-secondary" onClick={onPointerLock} disabled={!ready || !pointerLockAvailable}>{t("run.pointerLock")}</button>
        <p className={styles.helper}>{t(!pointerLockAvailable ? "run.pointerLockUnavailable" : !ready ? "run.afterBoot" : "run.pointerLockHint")}</p>
        {learnMore("keyboard")}
      </>}
      {name === "terminal" && <>
        <button type="button" className="button button-secondary" disabled={!snapshot.consoleReady} onClick={onTerminal}>{t(terminalOpen ? "run.returnTerminal" : "run.openTerminal")}</button>
        <p className={styles.helper}>{t(snapshot.consoleReady ? "run.terminalDescription" : "run.consoleUnavailable")}</p>
        {learnMore("keyboard")}
      </>}
      {name === "disk" && <>
        <dl className={styles.metrics}><div><dt>{t("run.originUsage")}</dt><dd>{storageValue(snapshot.storage.usage)}</dd></div><div><dt>{t("run.quota")}</dt><dd>{storageValue(snapshot.storage.quota)}</dd></div><div><dt>{t("run.protection")}</dt><dd>{t(!snapshot.storage.checked ? "run.unavailable" : snapshot.storage.persistent ? "run.granted" : "run.notGranted")}</dd></div></dl>
        <button type="button" className="button button-secondary" onClick={() => void protect()} disabled={protecting || snapshot.storage.persistent || !snapshot.storage.checked}>{t(protecting ? "run.requesting" : snapshot.storage.persistent ? "run.storageProtected" : "run.protectStorage")}</button>
        <div className={styles.actions}><button type="button" className="button button-secondary" disabled title={t("run.saveUnavailable")} aria-describedby={`${id}-disk-helper`}>{t("run.save")}</button><button type="button" className="button button-secondary" disabled={!ready} onClick={() => onDialog("reboot")}>{t("run.restart")}</button></div>
        <button type="button" className={`button button-secondary ${styles.danger}`} disabled={!ready} onClick={() => onDialog("reset")}>{t("run.resetDisk")}</button>
        <p id={`${id}-disk-helper`} className={styles.helper}>{t("run.diskDescription")}</p>
        <details className={styles.details}><summary>{t("run.storageInfo")}</summary><p>{t("run.diskWriteDetails")}</p><p>{t(!snapshot.storage.checked ? "run.storageUnavailable" : snapshot.storage.persistent ? "run.protectionGranted" : "run.storageLimits")}</p><p>{t("run.saveUnavailable")}</p></details>
        {learnMore("storage")}
      </>}
      {name === "network" && <>
        <dl className={styles.metrics}><div><dt>{t("run.tailscale")}</dt><dd>{t(`run.networkStates.${snapshot.network.phase}`)}</dd></div><div><dt>{t("run.ip")}</dt><dd>{snapshot.network.ip ?? t("run.unavailable")}</dd></div><div><dt>{t("run.exitNode")}</dt><dd>{t(snapshot.network.exitNode ? "run.exitDetected" : "run.exitNotDetected")}</dd></div></dl>
        {snapshot.network.loginUrl ? <a className="button button-secondary" href={snapshot.network.loginUrl} target="_blank" rel="noopener noreferrer">{t("run.continueLogin")}<ArrowUpRight size={14} aria-hidden="true" /></a> : snapshot.network.phase !== "connected" && <button type="button" className="button button-secondary" onClick={onConnect} disabled={!ready || connecting}>{t(connecting ? "run.connecting" : "run.connectTailscale")}</button>}
        <p className={styles.helper}>{t(!ready ? "run.afterBoot" : connecting ? "run.loginPending" : "run.networkDescription")}</p>
        <details className={styles.details}><summary>{t("run.networkInfo")}</summary><p>{t("run.networkDetails")}</p>{snapshot.network.phase === "connected" && <p>{t("run.disconnectHint")}</p>}<a className={styles.link} href="https://tailscale.com/kb/1408/quick-guide-exit-nodes" target="_blank" rel="noopener noreferrer">{t("run.exitGuide")}<ArrowUpRight size={13} aria-hidden="true" /></a></details>
        {learnMore("network")}
        {snapshot.network.error && <div className={styles.error} role="alert"><p>{t("run.networkError")}</p><details className={styles.details}><summary>{t("run.technicalDetails")}</summary><pre>{snapshot.network.error}</pre></details></div>}
      </>}
      {name === "shortcuts" && <>
        <p className={styles.helper}>{t("run.modifier")} <kbd>Alt</kbd></p>
        <table className={styles.shortcuts}><caption className="sr-only">{t("run.guestShortcuts")}</caption><thead><tr><th scope="col">{t("docs.keyboard.keys")}</th><th scope="col">{t("docs.keyboard.action")}</th></tr></thead><tbody>{guestShortcuts.map((shortcut) => <tr key={shortcut.keys}><td><Keys value={t(shortcut.keys)} /></td><td>{t(shortcut.action)}</td></tr>)}</tbody></table>
        <h3 className={styles.subheading}>{t("run.browserShortcuts.title")}</h3>
        <table className={styles.shortcuts}><caption className="sr-only">{t("run.browserShortcuts.title")}</caption><tbody><tr><td><Keys value={MENU_CHORD} /></td><td>{t("run.browserShortcuts.menu")}</td></tr><tr><td><Keys value={t("run.browserShortcuts.paletteKeys")} /></td><td>{t("run.browserShortcuts.palette")}</td></tr></tbody></table>
        <details className={styles.details}><summary>{t("run.inputInfo")}</summary><p>{t("run.inputHint")}</p><p>{t("docs.keyboard.caveat")}</p><a className={styles.link} href="https://github.com/leaningtech/alpine-image/blob/master/config/i3/config" target="_blank" rel="noopener noreferrer">{t("docs.keyboard.source")}<ArrowUpRight size={13} aria-hidden="true" /></a></details>
        {learnMore("keyboard")}
      </>}
      {operationError && (name === "display" || name === "disk") && <div className={styles.error} role="alert"><p>{t(name === "disk" && snapshot.operationError?.startsWith("Браузер не разрешил защиту") ? "run.protectionDenied" : "run.operationError")}</p><details className={styles.details}><summary>{t("run.technicalDetails")}</summary><pre>{operationError}</pre></details></div>}
    </section>
    {/* The adapter owns this exact pre node; switching panels must never replace it. */}
    <section hidden={name !== "logs"} className={styles.content} aria-labelledby={`${id}-title`}>
      <button type="button" className={`button button-secondary ${styles.copyButton}`} onClick={() => void copyLogs()}><Copy size={14} aria-hidden="true" />{t("run.copyLogs")}</button>
      <p className={styles.helper}>{t("run.logsDescription")}</p>
      <p hidden={!copyState} className={styles.helper} role="status">{copyState && t(copyState === "copied" ? "run.logsCopied" : "run.clipboardDenied")}</p>
      <pre ref={consoleRef} className={`system-console ${styles.systemConsole}`} tabIndex={0} aria-label={t("run.logsTitle")} />
    </section>
  </div>;
}
