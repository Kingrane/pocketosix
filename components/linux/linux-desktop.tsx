"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { useLinuxDesktop } from "@/hooks/use-linux-desktop";
import { useKmsInput } from "@/hooks/use-kms-input";
import { useLanguage } from "@/components/ui/language-provider";
import { BootScreen } from "./boot-screen";
import { DesktopToolbar, type DialogName } from "./desktop-toolbar";
import { DesktopDialog, DesktopLogs } from "./desktop-dialog";
import { GuestTerminal } from "./guest-terminal";
import styles from "./desktop-shell.module.css";

export function LinuxDesktop() {
  const { snapshot, canvasRef, consoleRef, actions } = useLinuxDesktop();
  useKmsInput(canvasRef);
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [compact, setCompact] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [dock, setDock] = useState<"bottom" | "right">("bottom");
  const [terminalSize, setTerminalSize] = useState(280);
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const [scale, setScale] = useState<"fit" | "native">("fit");
  const [fullscreen, setFullscreen] = useState(false);
  const [capabilities, setCapabilities] = useState({ fullscreen: false, pointerLock: false });
  const [helpDismissed, setHelpDismissed] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [operationDismissed, setOperationDismissed] = useState<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const focusFrame = useRef<number | null>(null);
  const drag = useRef<{ position: number; size: number } | null>(null);

  useEffect(() => {
    const media = matchMedia("(max-width: 720px)");
    const updateCompact = () => setCompact(media.matches);
    const frame = requestAnimationFrame(() => {
      updateCompact();
      setCapabilities({ fullscreen: Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen), pointerLock: typeof canvasRef.current?.requestPointerLock === "function" });
      try { setHelpDismissed(Boolean(localStorage.getItem("pocketosix:desktop-help"))); } catch { /* Optional UI preference. */ }
    });
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === document.documentElement);
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.fullscreenElement === document.documentElement && !document.querySelector("dialog[open]")) {
        void document.exitFullscreen().catch(() => setUiError("run.fullscreenDenied"));
      }
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    document.addEventListener("keydown", exitOnEscape);
    media.addEventListener("change", updateCompact);
    return () => { cancelAnimationFrame(frame); if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current); document.removeEventListener("fullscreenchange", updateFullscreen); document.removeEventListener("keydown", exitOnEscape); media.removeEventListener("change", updateCompact); };
  }, [canvasRef]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setUiError("run.fullscreenDenied"); }
  }
  function openDialog(name: DialogName) {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    if (!dialog) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(name);
  }
  function closeDialog() {
    const target = returnFocus.current;
    const closingFocus = document.activeElement;
    setDialog(null);
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      // A subsequent canvas / tty1 interaction owns focus now. Never override
      // it with a delayed return to the control that opened the dialog.
      if (!document.querySelector("dialog[open]") && (document.activeElement === document.body || document.activeElement === closingFocus) && target?.isConnected) target.focus({ preventScroll: true });
    });
  }
  async function pointerLock() {
    closeDialog();
    try { await canvasRef.current?.requestPointerLock(); } catch { setUiError("run.pointerLockDenied"); }
  }
  const effectiveDock = compact ? "bottom" : dock;
  const operationError = snapshot.operationError && snapshot.operationError !== operationDismissed;
  const ready = snapshot.phase === "ready";
  return <div className={`app-shell ${styles.shell}`} ref={rootRef} data-vm-phase={snapshot.phase}>
    <a href="#main-content" className="skip-link">{t("run.skipDesktop")}</a>
    <DesktopToolbar snapshot={snapshot} fullscreen={fullscreen} fullscreenAvailable={capabilities.fullscreen} open={Boolean(dialog)} onFullscreen={() => void toggleFullscreen()} onDialog={openDialog} />
    <main id="main-content" tabIndex={-1} className={`${styles.workarea} ${terminalOpen ? effectiveDock === "bottom" ? styles.dockBottom : styles.dockRight : ""} ${terminalExpanded && terminalOpen ? styles.terminalExpanded : ""}`} style={{ "--terminal-size": `${terminalSize}px` } as CSSProperties}>
      <section className={styles.desktopTile} aria-label={t("run.desktopTitle")}>
        <div className={`desktop-stage ${styles.stage} ${scale === "native" ? styles.nativeScale : ""}`} inert={Boolean(dialog)}>
          <canvas ref={canvasRef} className={`linux-canvas ${styles.canvas} ${ready ? "is-live" : ""}`} tabIndex={0} aria-label={t("run.canvasLabel")} onContextMenu={(event) => event.preventDefault()}>{t("run.canvasFallback")}</canvas>
          <BootScreen snapshot={snapshot} onBoot={actions.start} onLogs={() => openDialog("logs")} onTerminal={() => setTerminalOpen(true)} />
        </div>
      </section>
      {terminalOpen && <>
        <div className={styles.splitter} role="separator" tabIndex={0} aria-label={t("run.terminalSize")} aria-orientation={effectiveDock === "bottom" ? "horizontal" : "vertical"} aria-valuemin={160} aria-valuemax={600} aria-valuenow={terminalSize}
          onPointerDown={(event) => { drag.current = { position: effectiveDock === "bottom" ? event.clientY : event.clientX, size: terminalSize }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => { if (drag.current) setTerminalSize(Math.max(160, Math.min(600, drag.current.size + drag.current.position - (effectiveDock === "bottom" ? event.clientY : event.clientX)))); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
          onKeyDown={(event) => { if (["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.key)) { event.preventDefault(); setTerminalSize((size) => Math.max(160, Math.min(600, size + (["ArrowUp", "ArrowLeft"].includes(event.key) ? 24 : -24)))); } }} />
        <GuestTerminal dock={effectiveDock} compact={compact} expanded={terminalExpanded} onDock={() => setDock((value) => value === "bottom" ? "right" : "bottom")} onExpand={() => setTerminalExpanded((value) => !value)} onClose={() => setTerminalOpen(false)} />
      </>}
    </main>
    {ready && !helpDismissed && !terminalOpen && <aside className={styles.firstUse} aria-label={t("run.gettingStarted")}><div><strong>{t("run.gettingStarted")}</strong><p>{t("run.firstUse")} <kbd>{t("run.shortcuts.terminal.keys")}</kbd> {t("run.firstUseTerminal")} <kbd>{t("run.shortcuts.launcher.keys")}</kbd> {t("run.firstUseLauncher")}</p><button className={styles.textButton} onClick={() => setTerminalOpen(true)}>{t("run.openTerminal")}</button></div><button className="icon-button" aria-label={t("run.dismissHelp")} onClick={() => { setHelpDismissed(true); try { localStorage.setItem("pocketosix:desktop-help", "seen"); } catch { /* Optional UI preference. */ } }}><X size={15} aria-hidden="true" /></button></aside>}
    {(uiError || operationError) && !dialog && <div className={styles.notification} role="alert"><div><span>{t(uiError ?? "run.operationError")}</span>{operationError && <details className={styles.technical}><summary>{t("run.technicalDetails")}</summary><pre>{snapshot.operationError}</pre></details>}</div><button className="icon-button" aria-label={t("run.dismissMessage")} onClick={() => { setUiError(null); setOperationDismissed(snapshot.operationError); actions.clearOperationError(); }}><X size={16} aria-hidden="true" /></button></div>}
    <DesktopLogs open={dialog === "logs"} consoleRef={consoleRef} onClose={closeDialog} />
    {dialog && dialog !== "logs" && <DesktopDialog key={dialog} name={dialog} snapshot={snapshot} scale={scale} onScale={setScale} pointerLockAvailable={capabilities.pointerLock} onPointerLock={() => void pointerLock()} terminalOpen={terminalOpen} onTerminal={() => { setTerminalOpen(true); closeDialog(); }} onClose={closeDialog} onDialog={openDialog} onConnect={actions.connectNetwork} onProtect={actions.protectStorage} onReset={actions.resetDisk} />}
  </div>;
}
