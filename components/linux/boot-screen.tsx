"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { useLanguage } from "@/components/ui/language-provider";
import type { WebVMSnapshot } from "@/lib/webvm-state";
import styles from "./desktop-shell.module.css";

const phases = ["checking", "engine", "disk", "starting"];
const errorKeys: Record<string, string> = { isolation: "isolation", unsupported: "unsupported", "disk-locked": "locked", disk: "disk", runtime: "runtime" };

export function BootScreen({ snapshot, onBoot, onLogs, onTerminal, onLeave }: { snapshot: WebVMSnapshot; onBoot: () => void; onLogs: () => void; onTerminal: () => void; onLeave: () => void }) {
  const { t } = useLanguage();
  const [failures, setFailures] = useState<string[] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [limitation, setLimitation] = useState(true);
  const active = phases.includes(snapshot.phase);
  useEffect(() => {
    // Capability reads do not import the SDK, open the disk, or start a session.
    const frame = requestAnimationFrame(() => {
      setFailures([
        ["secure", window.isSecureContext], ["isolation", window.crossOriginIsolated],
        ["shared", typeof SharedArrayBuffer !== "undefined"], ["wasm", typeof WebAssembly !== "undefined"],
        ["indexeddb", Boolean(window.indexedDB)], ["locks", Boolean(navigator.locks)],
      ].filter(([, ok]) => !ok).map(([key]) => String(key)));
      try { setLimitation(!localStorage.getItem("pocketosix:boot-limitation")); } catch { /* Optional UI preference. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!active) return;
    const started = performance.now();
    const timer = setInterval(() => setElapsed((value) => Math.max(value, Math.floor((performance.now() - started) / 1000))), 250);
    return () => clearInterval(timer);
  }, [active]);
  if (snapshot.phase === "ready") return null;
  const idle = snapshot.phase === "idle" || snapshot.phase === "stopped";
  const failed = Boolean(failures?.length);
  const errorKey = errorKeys[snapshot.error?.code ?? ""] ?? "runtime";
  return <div className={styles.bootOverlay} data-testid="boot-screen">
    <nav className={styles.bootNav} aria-label={t("run.navigation")}><button className={styles.brandButton} aria-label={t("run.exitHome")} onClick={onLeave}><Logo /></button><div><Link href="/docs" target="_blank" rel="noopener noreferrer">{t("common.docs")}</Link><LanguageSwitcher /></div></nav>
    <div className={styles.bootContent}>
      <div className={styles.bootMark}><Logo variant="mark" /></div>
      <h1>{snapshot.error ? t(`run.errors.${errorKey}.title`) : failed && idle ? t("run.preflightTitle") : idle ? t("run.openDesktop") : t("run.starting")}</h1>
      {snapshot.error ? <>
        <p role="alert">{t(`run.errors.${errorKey}.message`)}</p>
        <details className={styles.technical}><summary>{t("run.technicalDetails")}</summary><pre>{snapshot.error.code}{"\n"}{snapshot.error.detail}</pre></details>
        <div className={styles.bootActions}><button className="button button-primary" onClick={() => window.location.reload()}>{t("run.retry")}</button><button className={styles.textButton} onClick={onLogs}>{t("run.showLogs")}</button></div>
      </> : idle ? <>
        {failed ? <ul className={styles.failures}>{failures?.map((key) => <li key={key}><strong>{t(`run.capabilities.${key}.label`)}</strong><span>{t(`run.capabilities.${key}.hint`)}</span></li>)}</ul> : <p>{t("run.openDescription")}</p>}
        <button className={`button button-primary ${styles.bootButton}`} onClick={onBoot} disabled={failures === null || failed}>{t("run.boot")}</button>
        <small>{t(failures === null ? "run.readingCapabilities" : failed ? "run.fixCapabilities" : "run.bootDownload")}</small>
      </> : <>
        <ol className={styles.stepper} aria-label={t("run.bootStages")}>{phases.map((phase, index) => <li key={phase} className={phase === snapshot.phase ? styles.currentStep : index < phases.indexOf(snapshot.phase) ? styles.completedStep : styles.pendingStep} aria-current={phase === snapshot.phase ? "step" : undefined}>{index < phases.indexOf(snapshot.phase) ? <Check size={14} aria-hidden="true" /> : <span aria-hidden="true" />}{t(`run.steps.${phase}`)}</li>)}</ol>
        <p className={styles.elapsed}><span>{t("run.elapsed")}</span> <span>{elapsed}{t("run.seconds")}</span></p>
        {snapshot.bootSlow && <p className={styles.slowHint} role="status">{t("run.bootSlow")}</p>}
        <div className={styles.bootActions}><button className={styles.textButton} onClick={onLogs}>{t("run.showLogs")}</button>{snapshot.consoleReady && <button className={styles.textButton} onClick={onTerminal}>{t("run.openTerminal")}</button>}</div>
        {limitation && <div className={styles.limitation}><span>{t("run.limitation")}</span><button className="icon-button" aria-label={t("run.dismissLimitation")} onClick={() => { setLimitation(false); try { localStorage.setItem("pocketosix:boot-limitation", "seen"); } catch { /* Optional UI preference. */ } }}><X size={13} aria-hidden="true" /></button></div>}
      </>}
    </div>
  </div>;
}
