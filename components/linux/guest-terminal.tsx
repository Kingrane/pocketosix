"use client";

import { useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { Copy, Eraser, Maximize2, PanelBottom, PanelRight, X } from "lucide-react";
import { useLanguage } from "@/components/ui/language-provider";
import { webvm } from "@/lib/webvm";
import "@xterm/xterm/css/xterm.css";
import styles from "./desktop-shell.module.css";

export function GuestTerminal({ dock, compact, expanded, onDock, onExpand, onClose }: { dock: "bottom" | "right"; compact: boolean; expanded: boolean; onDock: () => void; onExpand: () => void; onClose: () => void }) {
  const { t } = useLanguage();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    let input: { dispose: () => void } | undefined;
    let selection: { dispose: () => void } | undefined;
    let terminal: Terminal | undefined;
    void import("@xterm/xterm").then(({ Terminal }) => {
      if (cancelled || !hostRef.current) return;
      // tty1 dimensions are fixed at the official console's 100 × 30. The SDK
      // exposes no documented resize-PTY method; the tile itself scrolls.
      terminal = new Terminal({ cols: 100, rows: 30, fontFamily: getComputedStyle(hostRef.current).fontFamily, fontSize: 13, cursorBlink: !matchMedia("(prefers-reduced-motion: reduce)").matches, convertEol: true, screenReaderMode: true, theme: { background: "#08090a", foreground: "#f7f8f8", cursor: "#748cab", selectionBackground: "#303b49", black: "#0e0f11", red: "#d98282", green: "#92b49c", yellow: "#c6b28a", blue: "#748cab", magenta: "#ae9cb4", cyan: "#8cb4ba", white: "#f7f8f8", brightBlack: "#8a8f98", brightRed: "#e49b9b", brightGreen: "#aec9b6", brightYellow: "#d8c7a5", brightBlue: "#9aafc9", brightMagenta: "#c3b3c8", brightCyan: "#acd0d4", brightWhite: "#ffffff" } });
      termRef.current = terminal;
      terminal.open(hostRef.current);
      release = webvm.attachTerminal((text) => terminal?.write(text));
      input = terminal.onData(webvm.sendTerminal);
      selection = terminal.onSelectionChange(() => setSelected(Boolean(terminal?.getSelection())));
      setReady(true);
    }).catch((error: unknown) => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; release?.(); input?.dispose(); selection?.dispose(); terminal?.dispose(); termRef.current = null; };
  }, []);

  async function copy() {
    const text = termRef.current?.getSelection();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { setError("clipboard"); }
  }

  return <section className={styles.terminal} aria-label={t("run.terminalRegion")}>
    <div className={styles.tileHeader}><span>{t("run.terminalHeading")}</span><div className={styles.tileActions}>
      <button className="icon-button" disabled={!ready} aria-label={t("run.clearTerminal")} title={t(ready ? "run.clearTerminal" : "run.terminalLoading")} onClick={() => termRef.current?.clear()}><Eraser size={14} strokeWidth={1.5} aria-hidden="true" /></button>
      <button className="icon-button" disabled={!selected} aria-label={t("run.copySelection")} title={t(selected ? "run.copySelection" : "run.selectToCopy")} onClick={() => void copy()}><Copy size={14} strokeWidth={1.5} aria-hidden="true" /></button>
      <button className="icon-button" aria-label={t("run.changeDock")} disabled={compact} title={t(compact ? "run.mobileDock" : "run.changeDock")} onClick={onDock}>{dock === "bottom" ? <PanelRight size={14} strokeWidth={1.5} aria-hidden="true" /> : <PanelBottom size={14} strokeWidth={1.5} aria-hidden="true" />}</button>
      <button className="icon-button" aria-label={t(expanded ? "run.restoreTerminal" : "run.expandTerminal")} aria-pressed={expanded} onClick={onExpand}><Maximize2 size={14} strokeWidth={1.5} aria-hidden="true" /></button>
      <button className="icon-button" aria-label={t("run.closeTerminal")} onClick={onClose}><X size={14} strokeWidth={1.5} aria-hidden="true" /></button>
    </div></div>
    <div className={styles.terminalNote}>{t("run.terminalLogin")}</div>
    {error && <div className={styles.terminalError} role="alert"><p>{t(error === "clipboard" ? "run.clipboardDenied" : "run.terminalError")}</p>{error !== "clipboard" && <details className={styles.technical}><summary>{t("run.technicalDetails")}</summary><pre>{error}</pre></details>}</div>}
    <div ref={hostRef} className={styles.terminalHost} />
  </section>;
}
