"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Home, Search, X } from "lucide-react";
import { useLinuxDesktop } from "@/hooks/use-linux-desktop";
import { useKmsInput } from "@/hooks/use-kms-input";
import { useLanguage } from "@/components/ui/language-provider";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { DESKTOP_PANELS, MENU_CHORD, type DesktopMode, type DialogName, type PanelName } from "@/lib/desktop-ui";
import { BootScreen } from "./boot-screen";
import { DesktopToolbar, PANEL_ICONS } from "./desktop-toolbar";
import { DesktopRail } from "./desktop-rail";
import { DesktopConfirm, DesktopModal } from "./desktop-dialog";
import { DesktopPanel } from "./desktop-panel";
import { GuestTerminal } from "./guest-terminal";
import styles from "./desktop-shell.module.css";
import type { GuestApp } from "@/lib/guest-desktop";

export function LinuxDesktop() {
  const { snapshot, canvasRef, consoleRef, actions } = useLinuxDesktop();
  useKmsInput(canvasRef);
  const { t } = useLanguage();
  const [mode, setMode] = useState<DesktopMode>("docked");
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [query, setQuery] = useState("");
  const [compact, setCompact] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [dock, setDock] = useState<"bottom" | "right">("bottom");
  const [terminalSize, setTerminalSize] = useState(280);
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const [scale, setScale] = useState<"fit" | "native">("fit");
  const [capabilities, setCapabilities] = useState({ fullscreen: false, pointerLock: false });
  const [immersiveHint, setImmersiveHint] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [operationDismissed, setOperationDismissed] = useState<string | null>(null);
  const panelOpen = panel !== null;
  const overlayOpen = panelOpen || dialog !== null;
  const guestBlocked = overlayOpen || (terminalOpen && terminalExpanded);
  const panelRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const focusFrame = useRef<number | null>(null);
  const drag = useRef<{ position: number; size: number } | null>(null);

  const cancelFocus = useCallback(() => { if (focusFrame.current !== null) { cancelAnimationFrame(focusFrame.current); focusFrame.current = null; } }, []);
  const rememberFocus = useCallback(() => {
    cancelFocus();
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The SDK removes both its old textarea and its marker when resizing.
    returnFocus.current = active?.matches("[data-pocketosix-kms-input]") ? canvasRef.current : active;
  }, [cancelFocus, canvasRef]);
  const restoreFocus = useCallback(() => {
    cancelFocus();
    const closingFocus = document.activeElement;
    const origin = returnFocus.current;
    // Resize can replace the SDK's body textarea. Focus the stable canvas so
    // useKmsInput can resolve the current SDK-owned input instead of a stale node.
    const target = mode === "immersive" ? canvasRef.current : origin;
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      // A later canvas / tty1 interaction wins over a deferred UI focus return.
      if (!document.querySelector("dialog:modal") && target?.isConnected && !target.closest("[inert]") &&
        (document.activeElement === document.body || document.activeElement === closingFocus || document.activeElement === origin)) target.focus({ preventScroll: true });
    });
  }, [cancelFocus, canvasRef, mode]);
  const closePanel = useCallback(() => { setPanel(null); restoreFocus(); }, [restoreFocus]);
  const closeDialog = useCallback(() => { setDialog(null); restoreFocus(); }, [restoreFocus]);
  const openPanel = useCallback((name: PanelName) => {
    const railTrigger = document.activeElement instanceof HTMLElement && document.activeElement.matches(`[data-panel-trigger="${name}"]`);
    // A rail click becomes the return target; menu actions keep the guest origin.
    if (railTrigger || (!dialog && !panel)) rememberFocus(); else cancelFocus();
    if (panel === name && !dialog) { closePanel(); return; }
    setDialog(null);
    setPanel(name);
    if (name === "apps") void actions.inspectGuestDesktop();
  }, [panel, dialog, closePanel, rememberFocus, cancelFocus, actions]);
  const openDialog = useCallback((name: DialogName) => {
    if (!dialog && !panel) rememberFocus();
    setPanel(null);
    setQuery("");
    setDialog(name);
  }, [dialog, panel, rememberFocus]);

  useEffect(() => {
    const media = matchMedia("(max-width: 720px)");
    const updateCompact = () => setCompact(media.matches);
    const frame = requestAnimationFrame(() => {
      updateCompact();
      setCapabilities({ fullscreen: Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen), pointerLock: typeof canvasRef.current?.requestPointerLock === "function" });
    });
    const updateFullscreen = () => {
      const immersive = document.fullscreenElement === document.documentElement;
      setMode(immersive ? "immersive" : "docked");
      setPanel(null);
      setDialog((current) => current === "leave" || current === "reset" || current === "reboot" ? current : null);
      if (immersive) {
        try {
          if (!sessionStorage.getItem("pocketosix:immersive-hint")) { setImmersiveHint(true); sessionStorage.setItem("pocketosix:immersive-hint", "seen"); }
        } catch { setImmersiveHint(true); }
      } else setImmersiveHint(false);
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    media.addEventListener("change", updateCompact);
    return () => { cancelAnimationFrame(frame); cancelFocus(); document.removeEventListener("fullscreenchange", updateFullscreen); media.removeEventListener("change", updateCompact); };
  }, [cancelFocus, canvasRef]);

  useLayoutEffect(() => {
    if (!guestBlocked) return;
    const inputs = new Map<HTMLTextAreaElement, boolean>();
    const blockInput = () => {
      // useKmsInput identifies this version-specific SDK binding. Never move it
      // out of body or take over its keyboard listeners.
      document.querySelectorAll<HTMLTextAreaElement>("textarea[data-pocketosix-kms-input]").forEach((input) => {
        if (!inputs.has(input)) inputs.set(input, input.inert);
        const hadFocus = document.activeElement === input;
        input.inert = true;
        if (hadFocus && panelRef.current?.open) panelRef.current.querySelector<HTMLButtonElement>("[data-panel-close]")?.focus({ preventScroll: true });
      });
    };
    const observer = new MutationObserver(blockInput);
    // The input hook can mark a newly inserted textarea after this observer's
    // setup. Watch its marker, not just insertion order, including after resize.
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-pocketosix-kms-input"] });
    blockInput();
    return () => { observer.disconnect(); inputs.forEach((inert, input) => { if (input.isConnected) input.inert = inert; }); };
  }, [guestBlocked]);

  useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node || !panelOpen) return;
    if (mode === "immersive") node.showModal(); else node.show();
    return () => { if (node.open) node.close(); };
  }, [panelOpen, mode]);

  useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node || !panel) return;
    node.scrollTop = 0;
    node.querySelector<HTMLButtonElement>("[data-panel-close]")?.focus({ preventScroll: true });
  }, [panel, mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = () => {
      // Native presentation follows the real backing image, not layout sizing.
      // The runtime must measure the separate data-kms-viewport for KMS resize.
      canvas.style.setProperty("--guest-image-width", `${canvas.width}px`);
      canvas.style.setProperty("--guest-image-height", `${canvas.height}px`);
    };
    const observer = new MutationObserver(size);
    observer.observe(canvas, { attributes: true, attributeFilter: ["width", "height"] });
    size();
    return () => { observer.disconnect(); canvas.style.removeProperty("--guest-image-width"); canvas.style.removeProperty("--guest-image-height"); };
  }, [canvasRef]);

  useEffect(() => {
    if (!immersiveHint) return;
    const timer = setTimeout(() => setImmersiveHint(false), 6000);
    return () => clearTimeout(timer);
  }, [immersiveHint]);

  useEffect(() => {
    let pendingMenu = false;
    let menuKeyHeld = false;
    let menuFrame: number | undefined;
    const keyboard = (event: KeyboardEvent) => {
      const menuKey = event.code === "KeyM" || (!event.code && event.key.toLowerCase() === "m");
      const menuChord = event.type === "keydown" && event.ctrlKey && event.altKey && event.shiftKey && !event.metaKey && menuKey;
      const target = event.target instanceof Element ? event.target : null;
      const guest = target === canvasRef.current || target?.matches("[data-pocketosix-kms-input]") || Boolean(target?.closest(".xterm"));
      const palette = !guest && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && (event.code === "KeyK" || (!event.code && event.key.toLowerCase() === "k"));
      if (pendingMenu) {
        if (menuKey) {
          event.preventDefault();
          event.stopImmediatePropagation();
          menuKeyHeld = event.type === "keydown";
        }
        if (event.type === "keyup" && !menuKeyHeld && !event.ctrlKey && !event.altKey && !event.shiftKey) {
          // Real modifier keyups must reach the SDK textarea before a modal takes focus.
          pendingMenu = false;
          menuFrame = requestAnimationFrame(() => openDialog("menu"));
        }
        return;
      }
      if ((!menuChord && !palette) || (dialog && dialog !== "menu" && dialog !== "palette")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown" && !event.repeat) {
        if (menuChord) { pendingMenu = true; menuKeyHeld = true; }
        else openDialog("palette");
      }
    };
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("keyup", keyboard, true);
    return () => { if (menuFrame !== undefined) cancelAnimationFrame(menuFrame); document.removeEventListener("keydown", keyboard, true); document.removeEventListener("keyup", keyboard, true); };
  }, [canvasRef, dialog, openDialog]);

  async function toggleImmersive() {
    try {
      if (document.fullscreenElement === document.documentElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      // Fullscreen the document, not the stage: CheerpX's input lives under body.
      cancelFocus();
      focusFrame.current = requestAnimationFrame(() => { focusFrame.current = null; if (!document.querySelector("dialog:modal")) canvasRef.current?.focus({ preventScroll: true }); });
    } catch { setUiError("run.fullscreenDenied"); }
  }
  async function pointerLock() {
    closePanel();
    try { await canvasRef.current?.requestPointerLock(); } catch { setUiError("run.pointerLockDenied"); }
  }
  function openTerminal() { setTerminalOpen(true); closePanel(); }
  function launchGuest(app: GuestApp) {
    void actions.launchGuestApp(app);
    closePanel();
    cancelFocus();
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (!document.querySelector("dialog:modal, [data-panel-overlay=true]")) canvasRef.current?.focus({ preventScroll: true });
    });
  }
  function leaveDesktop() {
    // End the document and its writer; client-side navigation would retain the runtime.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }
  const effectiveDock = compact ? "bottom" : dock;
  const operationError = snapshot.operationError && snapshot.operationError !== operationDismissed;
  const ready = snapshot.phase === "ready";
  const menuPanels = DESKTOP_PANELS.filter((name) => t(`run.panels.${name}`).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className={`app-shell ${styles.shell} ${mode === "immersive" ? styles.immersive : ""}`} data-mode={mode} data-vm-phase={snapshot.phase} onPointerDownCapture={cancelFocus}>
    <a href="#main-content" className="skip-link">{t("run.skipDesktop")}</a>
    <DesktopRail snapshot={snapshot} panel={panel} fullscreenAvailable={capabilities.fullscreen} onPanel={openPanel} onLeave={() => openDialog("leave")} onImmersive={() => void toggleImmersive()} />
    <dialog id="desktop-panel" ref={panelRef} className={styles.panelContainer} data-panel-overlay={panelOpen ? "true" : undefined} aria-label={t(panel ? `run.panels.${panel}` : "run.panel")} onCancel={(event) => { event.preventDefault(); closePanel(); }}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); closePanel(); } }} onKeyUp={(event) => event.stopPropagation()}
      onClick={(event) => { if (event.target === event.currentTarget && mode === "immersive") { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel(); } }}>
      <DesktopPanel name={panel} snapshot={snapshot} scale={scale} pointerLockAvailable={capabilities.pointerLock} terminalOpen={terminalOpen} consoleRef={consoleRef} onClose={closePanel} onScale={setScale} onPointerLock={() => void pointerLock()} onTerminal={openTerminal} onDialog={openDialog} onConnect={actions.connectNetwork} onProtect={actions.protectStorage} guestControls={{ onLaunch: launchGuest, onInspect: () => void actions.inspectGuestDesktop(), onFloating: () => void actions.toggleGuestFloating(), onWindow: (target, action) => void actions.controlGuestWindow(target, action) }} />
    </dialog>
    <main id="main-content" tabIndex={-1} className={`${styles.workarea} ${terminalOpen ? effectiveDock === "bottom" ? styles.dockBottom : styles.dockRight : ""} ${terminalExpanded && terminalOpen ? styles.terminalExpanded : ""}`} style={{ "--terminal-size": `${terminalSize}px` } as CSSProperties} inert={overlayOpen}>
      <section className={styles.desktopTile} aria-label={t("run.desktopTitle")} inert={terminalOpen && terminalExpanded}>
        <div className={`desktop-stage ${styles.stage} ${scale === "native" ? styles.nativeScale : ""}`} data-kms-viewport data-kms-scale={scale}>
          <canvas ref={canvasRef} className={`linux-canvas ${styles.canvas} ${ready ? "is-live" : ""}`} tabIndex={0} aria-label={t("run.canvasLabel")} onContextMenu={(event) => event.preventDefault()}>{t("run.canvasFallback")}</canvas>
          <BootScreen snapshot={snapshot} onBoot={actions.start} onLogs={() => openPanel("logs")} onTerminal={() => setTerminalOpen(true)} onLeave={() => openDialog("leave")} />
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
    {mode === "immersive" && <DesktopToolbar snapshot={snapshot} open={Boolean(dialog || panel)} onExitImmersive={() => void toggleImmersive()} onGuestFocus={() => canvasRef.current?.focus({ preventScroll: true })} onPanel={openPanel} onDialog={openDialog} />}
    {immersiveHint && !dialog && !panel && <div className={styles.immersiveHint} role="status">{t("run.immersiveHint")}</div>}
    {snapshot.guestDesktop.pending && !dialog && !panel && <div className={styles.notification} role="status">{t("run.guest.working")}</div>}
    {snapshot.guestDesktop.error && !dialog && !panel && <div className={styles.notification} role="alert"><span>{snapshot.guestDesktop.error}</span><button type="button" className="icon-button" aria-label={t("run.appsTitle")} onClick={() => openPanel("apps")}><Search size={16} aria-hidden="true" /></button></div>}
    {(uiError || operationError) && !dialog && <div className={styles.notification} role="alert"><div><span>{t(uiError ?? "run.operationError")}</span>{operationError && <details className={styles.technical}><summary>{t("run.technicalDetails")}</summary><pre>{snapshot.operationError}</pre></details>}</div><button className="icon-button" aria-label={t("run.dismissMessage")} onClick={() => { setUiError(null); setOperationDismissed(snapshot.operationError); actions.clearOperationError(); }}><X size={16} aria-hidden="true" /></button></div>}
    {(dialog === "menu" || dialog === "palette") && <DesktopModal key={dialog} title={t(dialog === "palette" ? "run.commandPalette" : "run.menuTitle")} onClose={closeDialog}>
      {dialog === "palette" && <label className={styles.commandSearch}><Search size={16} aria-hidden="true" /><input autoFocus data-autofocus value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("run.searchActions")} placeholder={t("run.searchActions")} /></label>}
      <div className={styles.menuActions}>
        <button onClick={() => openDialog("leave")}><Home size={18} strokeWidth={1.5} aria-hidden="true" />{t("run.backHome")}</button>
        {menuPanels.map((name) => { const Icon = PANEL_ICONS[name]; return <button key={name} onClick={() => openPanel(name)}><Icon size={18} strokeWidth={1.5} aria-hidden="true" />{t(`run.panels.${name}`)}</button>; })}
      </div>
      <div className={styles.menuFooter}><span><kbd>{MENU_CHORD}</kbd></span><LanguageSwitcher /></div>
    </DesktopModal>}
    {(dialog === "reset" || dialog === "reboot" || dialog === "leave") && <DesktopConfirm name={dialog} snapshot={snapshot} onClose={closeDialog} onReset={actions.resetDisk} onLeave={leaveDesktop} />}
  </div>;
}
