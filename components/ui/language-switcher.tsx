"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe2 } from "lucide-react";
import { languages, type Locale } from "@/lib/i18n";
import { useLanguage } from "./language-provider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    root.current?.querySelector<HTMLButtonElement>("[role=menuitemradio][aria-checked=true]")?.focus();
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return <div className="language-control" ref={root} onKeyDown={(event) => {
    if (!open) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={trigger} className="icon-button" aria-label={t("common.language")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Globe2 size={18} strokeWidth={1.5} aria-hidden="true" /></button>
    {open && <div className="language-menu" role="menu" aria-label={t("common.language")}>
      {Object.entries(languages).map(([code, name]) => <button key={code} role="menuitemradio" aria-checked={locale === code} disabled={busy} onClick={async () => { setBusy(true); try { await setLocale(code as Locale); setOpen(false); trigger.current?.focus(); } finally { setBusy(false); } }}>{name}{locale === code && <Check size={15} aria-hidden="true" />}</button>)}
    </div>}
  </div>;
}
