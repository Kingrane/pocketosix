"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadMessages, translate, LOCALE_COOKIE, type Locale, type Messages } from "@/lib/i18n";

type LanguageContextValue = { locale: Locale; setLocale: (locale: Locale) => Promise<void>; t: (key: string) => string };
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children, initialLocale, initialMessages }: { children: ReactNode; initialLocale: Locale; initialMessages: Messages }) {
  const [state, setState] = useState({ locale: initialLocale, messages: initialMessages });
  const generation = useRef(0);
  const setLocale = useCallback(async (locale: Locale) => {
    const token = ++generation.current;
    const messages = await loadMessages(locale);
    if (token !== generation.current) return;
    setState({ locale, messages });
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, []);
  useEffect(() => { document.documentElement.lang = state.locale; }, [state.locale]);
  const value = useMemo(() => ({ locale: state.locale, setLocale, t: (key: string) => translate(state.messages, key) }), [state, setLocale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
