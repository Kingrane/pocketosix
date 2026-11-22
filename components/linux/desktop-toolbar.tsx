import { useEffect, useRef, useState } from "react";
import { Expand, Keyboard, Minimize, MoreHorizontal } from "lucide-react";
import { useLanguage } from "@/components/ui/language-provider";
import type { WebVMSnapshot } from "@/lib/webvm-state";
import styles from "./desktop-shell.module.css";

export type DialogName = "menu" | "help" | "network" | "storage" | "logs" | "reset" | "reboot" | null;
type Props = { snapshot: WebVMSnapshot; fullscreen: boolean; fullscreenAvailable: boolean; open: boolean; onFullscreen: () => void; onDialog: (name: DialogName) => void };

export function DesktopToolbar({ snapshot, fullscreen, fullscreenAvailable, open, onFullscreen, onDialog }: Props) {
  const { t } = useLanguage();
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ready = snapshot.phase === "ready";
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      if (!open && !focused && !hovered) timer = setTimeout(() => setVisible(false), 2000);
    };
    const move = (event: PointerEvent) => {
      if (event.clientY <= 64) { setVisible(true); arm(); }
    };
    arm();
    window.addEventListener("pointermove", move, { passive: true });
    return () => { clearTimeout(timer); window.removeEventListener("pointermove", move); };
  }, [ready, open, focused, hovered]);
  if (!ready) return null;
  return <nav ref={ref} className={`${styles.toolbar} ${visible || open || focused || hovered ? "" : styles.toolbarHidden}`} aria-label={t("run.controls")}
    onPointerEnter={() => { setHovered(true); setVisible(true); }} onPointerLeave={() => setHovered(false)}
    onFocus={() => { setFocused(true); setVisible(true); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <span className={styles.toolbarStatus} role="status"><span className={styles.statusDot} aria-hidden="true" />{t("run.running")}</span>
    <button className="icon-button" disabled={!fullscreenAvailable} title={!fullscreenAvailable ? t("run.fullscreenUnavailable") : t(fullscreen ? "run.exitFullscreen" : "run.fullscreen")} aria-label={t(fullscreen ? "run.exitFullscreen" : "run.fullscreen")} onClick={onFullscreen}>{fullscreen ? <Minimize size={17} aria-hidden="true" /> : <Expand size={17} aria-hidden="true" />}</button>
    <button className="icon-button" aria-label={t("run.shortcutsTitle")} title={t("run.shortcutsTitle")} onClick={() => onDialog("help")}><Keyboard size={17} aria-hidden="true" /></button>
    <button className="icon-button" aria-label={t("run.openMenu")} title={t("run.openMenu")} aria-haspopup="dialog" aria-expanded={open} onClick={() => onDialog("menu")}><MoreHorizontal size={19} aria-hidden="true" /></button>
  </nav>;
}
