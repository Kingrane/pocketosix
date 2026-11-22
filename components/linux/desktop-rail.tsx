import { Expand } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { useLanguage } from "@/components/ui/language-provider";
import { DESKTOP_PANELS, type PanelName } from "@/lib/desktop-ui";
import type { WebVMSnapshot } from "@/lib/webvm-state";
import { desktopStatus, PANEL_ICONS } from "./desktop-toolbar";
import styles from "./desktop-shell.module.css";

export function DesktopRail({ snapshot, panel, fullscreenAvailable, onPanel, onLeave, onImmersive }: {
  snapshot: WebVMSnapshot; panel: PanelName | null; fullscreenAvailable: boolean; onPanel: (name: PanelName) => void; onLeave: () => void; onImmersive: () => void;
}) {
  const { t } = useLanguage();
  return <nav className={styles.rail} aria-label={t("run.rail")}>
    <button className={`icon-button ${styles.railBrand}`} aria-label={t("run.exitHome")} title={t("run.exitHome")} onClick={onLeave}><Logo variant="mark" /></button>
    <div className={styles.railPanels}>{DESKTOP_PANELS.map((name) => {
      const Icon = PANEL_ICONS[name];
      return <button key={name} className="icon-button" data-panel-trigger={name} aria-label={t(`run.panels.${name}`)} title={t(`run.panels.${name}`)} aria-haspopup="dialog" aria-expanded={panel === name} aria-controls="desktop-panel" onClick={() => onPanel(name)}><Icon size={18} strokeWidth={1.5} aria-hidden="true" /></button>;
    })}</div>
    <div className={styles.railBottom}>
      <span className={styles.railStatus} role="status" aria-label={t(desktopStatus(snapshot))} title={t(desktopStatus(snapshot))}><span className={styles.statusDot} data-phase={snapshot.phase} aria-hidden="true" /></span>
      <LanguageSwitcher />
      <button className="icon-button" disabled={!fullscreenAvailable} aria-label={t("run.enterImmersive")} title={t(fullscreenAvailable ? "run.enterImmersive" : "run.fullscreenUnavailable")} onClick={onImmersive}><Expand size={18} strokeWidth={1.5} aria-hidden="true" /></button>
    </div>
  </nav>;
}
