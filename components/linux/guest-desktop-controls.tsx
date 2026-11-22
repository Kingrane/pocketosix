"use client";

import { Folder, Grid2X2, Minus, RefreshCw, Terminal, X } from "lucide-react";
import { useLanguage } from "@/components/ui/language-provider";
import type { GuestApp, GuestWindowTarget } from "@/lib/guest-desktop";
import type { GuestDesktopState } from "@/lib/guest-desktop-state";
import styles from "./desktop-panel.module.css";

export type GuestControlProps = {
  guest: GuestDesktopState; ready: boolean;
  onLaunch: (app: GuestApp) => void; onInspect: () => void; onFloating: () => void;
  onWindow: (target: GuestWindowTarget, action: "close" | "hide" | "restore" | "floating" | "tiling") => void;
};

export function GuestDesktopControls({ guest, ready, onLaunch, onInspect, onFloating, onWindow }: GuestControlProps) {
  const { t } = useLanguage();
  const busy = Boolean(guest.pending);
  const enabled = ready && guest.phase === "ready" && !busy;
  const apps = [{ name: "launcher", icon: Grid2X2 }, { name: "terminal", icon: Terminal }, { name: "files", icon: Folder }, { name: "lightweight-files", icon: Folder }] as const;
  return <>
    <p className={styles.helper}>{t("run.guest.description")}</p>
    <div className={styles.appActions}>{apps.map(({ name, icon: Icon }) => <button key={name} type="button" className="button button-secondary" data-guest-launch={name} disabled={!enabled || !guest.apps.includes(name)} onClick={() => onLaunch(name)}><Icon size={16} aria-hidden="true" />{t(`run.guest.apps.${name}`)}</button>)}</div>
    <button type="button" className="button button-secondary" data-guest-floating aria-pressed={guest.floating === "on"} disabled={!enabled} onClick={onFloating}>{t(guest.floating === "on" || guest.floating === "stopping" ? "run.guest.stopFloating" : "run.guest.startFloating")}</button>
    <p className={styles.helper}>{t("run.guest.floatingHint")}</p>
    <button type="button" className={`button button-secondary ${styles.copyButton}`} disabled={!ready || busy} onClick={onInspect}><RefreshCw size={14} aria-hidden="true" />{t("run.guest.refresh")}</button>
    <p className={styles.helper} role="status" data-guest-status>{t(!ready ? "run.afterBoot" : busy ? guest.pending === "inspect" ? "run.guest.checking" : "run.guest.working" : guest.phase === "ready" ? "run.guest.connected" : "run.guest.inspectHint")}</p>
    {guest.error && <p className={styles.error} role="alert">{guest.error}</p>}
    <h3 className={styles.subheading}>{t("run.guest.windowList")}</h3>
    {guest.phase === "ready" && guest.windows.length === 0 && <p className={styles.helper}>{t("run.guest.noWindows")}</p>}
    <ul className={styles.windowList}>{guest.windows.map(window => {
      const name = window.title || window.className || `${t("run.guest.window")} ${window.windowId}`;
      return <li key={`${window.containerId}-${window.windowId}`} data-guest-window={window.windowId} data-guest-hidden={window.hidden}>
        <strong title={name}>{name}</strong><span>{window.className} · {t(window.hidden ? "run.guest.hidden" : window.floating ? "run.guest.floating" : "run.guest.tiling")}</span>
        <div className={styles.windowActions}>
          <button type="button" disabled={!enabled} aria-label={`${t(window.hidden ? "run.guest.restore" : "run.guest.hide")} ${name}`} onClick={() => onWindow(window, window.hidden ? "restore" : "hide")}><Minus size={13} aria-hidden="true" />{t(window.hidden ? "run.guest.restore" : "run.guest.hide")}</button>
          <button type="button" disabled={!enabled} className={styles.danger} aria-label={`${t("run.guest.close")} ${name}`} onClick={() => onWindow(window, "close")}><X size={13} aria-hidden="true" />{t("common.close")}</button>
        </div>
      </li>;
    })}</ul>
    <p className={styles.helper}>{t("run.guest.closeHint")}</p>
  </>;
}
