"use client";

// Client-side locale context (roadmap M1-3a). Wraps the pure lookups in
// src/lib/ui/i18n.ts with React state + persistence so components can call
// useLocale().t(id) / useLocale().format(id, vars) without threading the
// current locale through props everywhere.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  format as formatMessage,
  resolveInitialLocale,
  t as translate,
  type Locale,
  type MessageId,
} from "@/lib/ui/i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (id: MessageId) => string;
  format: (id: MessageId, vars: Record<string, string>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function applyDocumentLang(locale: Locale): void {
  document.documentElement.lang = locale === "es" ? "es-AR" : "en";
}

function writeLocaleCookie(locale: Locale): void {
  // Mirror the locale into a cookie so the server can localize page
  // metadata (generateMetadata in layout.tsx). Best-effort; a blocked
  // document.cookie must not break the toggle.
  try {
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // ignore
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Defaults to DEFAULT_LOCALE ("es") so the very first client render
  // matches the server-rendered <html lang="es-AR">; the real stored
  // preference (if any) is applied after mount, below.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      // localStorage disabled/unavailable: stick with DEFAULT_LOCALE
    }
    const resolved = resolveInitialLocale(stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate locale from storage on mount
    setLocaleState(resolved);
    applyDocumentLang(resolved);
    writeLocaleCookie(resolved);
  }, []);

  function setLocale(next: Locale): void {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // best-effort persistence; the in-memory state still switches
    }
    applyDocumentLang(next);
    writeLocaleCookie(next);
  }

  const value: LocaleContextValue = {
    locale,
    setLocale,
    t: (id) => translate(locale, id),
    format: (id, vars) => formatMessage(locale, id, vars),
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
