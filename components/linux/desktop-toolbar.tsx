import { useEffect, useRef, useState } from "react";
import { Grid2X2, HardDrive, Keyboard, Monitor, MoreHorizontal, Network, ScrollText, Shrink, Terminal } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { useLanguage } from "@/components/ui/language-provider";
import type { WebVMSnapshot } from "@/lib/webvm-state";
import type { DialogName, PanelName } from "@/lib/desktop-ui";
import styles from "./desktop-shell.module.css";

export const PANEL_ICONS = { apps: Grid2X2, display: Monitor, terminal: Terminal, disk: HardDrive, network: Network, shortcuts: Keyboard, logs: ScrollText };
export function desktopStatus(snapshot: WebVMSnapshot) {
  return snapshot.phase === "ready" ? "run.running" : snapshot.phase === "error" ? "run.errorStatus" : snapshot.phase === "idle" || snapshot.phase === "stopped" ? "run.stoppedStatus" : "run.starting";
}

export function DesktopToolbar({ snapshot, open, onExitImmersive, onGuestFocus, onPanel, onDialog }: {
  snapshot: WebVMSnapshot; open: boolean; onExitImmersive: () => void; onGuestFocus: () => void; onPanel: (name: PanelName) => void; onDialog: (name: DialogName) => void;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      if (!open && !hovered && !focused) timer.current = setTimeout(() => setVisible(false), 2000);
    };
    const reveal = (event: PointerEvent) => { if (event.clientY >= 32 && event.clientY <= 56) { setVisible(true); arm(); } };
    arm();
    window.addEventListener("pointermove", reveal);
    return () => { if (timer.current) clearTimeout(timer.current); window.removeEventListener("pointermove", reveal); };
  }, [open, hovered, focused, visible]);
  return <>
    <button type="button" className={styles.notch} aria-label={t("run.showControls")} title={t("run.showControls")} onPointerEnter={() => { setHovered(true); setVisible(true); }} onPointerLeave={() => setHovered(false)} onClick={() => { setVisible(true); if (!open) onGuestFocus(); }}><span aria-hidden="true" /></button>
    <nav ref={ref} data-desktop-toolbar className={`${styles.toolbar} ${!visible && !open ? styles.toolbarHidden : ""}`} aria-label={t("run.toolbar")} inert={!visible && !open}
      onPointerEnter={() => { setHovered(true); setVisible(true); }} onPointerLeave={() => setHovered(false)}
      onFocus={() => { setFocused(true); setVisible(true); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      <button className="icon-button" aria-label={t("run.exitHome")} title={t("run.exitHome")} onClick={() => onDialog("leave")}><Logo variant="mark" /></button>
      <span className={styles.toolbarStatus}><span className={styles.statusDot} data-phase={snapshot.phase} aria-hidden="true" /><span>{t(desktopStatus(snapshot))}</span></span>
      <button className="icon-button" aria-label={t("run.exitImmersive")} title={t("run.exitImmersive")} onClick={onExitImmersive}><Shrink size={18} aria-hidden="true" /></button>
      <button className="icon-button" aria-label={t("run.shortcutsTitle")} title={t("run.shortcutsTitle")} onClick={() => onPanel("shortcuts")}><Keyboard size={18} aria-hidden="true" /></button>
      <button className="icon-button" aria-label={t("run.appsTitle")} title={t("run.appsTitle")} onClick={() => onPanel("apps")}><Grid2X2 size={18} aria-hidden="true" /></button>
      <button className="icon-button" aria-label={t("run.openMenu")} title={t("run.openMenu")} aria-haspopup="dialog" aria-expanded={open} onClick={() => onDialog("menu")}><MoreHorizontal size={18} aria-hidden="true" /></button>
    </nav>
  </>;
}
