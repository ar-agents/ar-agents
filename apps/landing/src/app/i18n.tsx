"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "es";

const STORAGE_KEY = "lang";

export type Translations = Record<keyof typeof EN, string>;

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
};

const LangCtx = createContext<Ctx | null>(null);

export function useLang(): Ctx {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}

/** Path-based detection: any URL under /en/* (or /en exactly) is English. */
function langFromPath(pathname: string): Lang | null {
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  return null;
}

export function LangProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  // `lang` is DERIVED, not synced via effects: path wins (any /en/* URL is
  // English), otherwise the user's stored preference. Deriving instead of
  // mirroring-with-effects removes the race that previously let the path-sync
  // effect fight a manual toggle during async navigation (e.g. toggling ES on
  // an /en page left lang stuck on "en", and toggling EN on a mirror-less page
  // like the home bounced straight back to "es").
  const [pref, setPref] = useState<Lang>("es");

  // Read the stored preference once on mount. On /en/* URLs this is cosmetic
  // (path overrides anyway); on canonical URLs it restores the last choice.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") setPref(stored);
  }, []);

  const lang: Lang = langFromPath(pathname) ?? pref;

  // Reflect the active language on <html lang> for a11y/SEO.
  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  // A manual toggle sets the preference and persists it. If the current page
  // has an /en mirror, LangSwitch also navigates; the derived `lang` then
  // follows the new path. No effect-driven reconciliation, so no bounce-back.
  const setLang = useCallback((v: Lang) => {
    setPref(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, v);
    }
  }, []);

  const t = lang === "es" ? ES : EN;
  const value = useMemo<Ctx>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

// ---------------------------------------------------------------------------
// Dictionary. Empty on purpose: the pre-redesign homepage copy (hero,
// comparison table, "what's in the box", primitive descriptions, FAQ, demo
// terminal, live chat suggestions) lived here, but every consumer of
// useLang() now destructures only `{ lang }` (or `{ lang, setLang }`); none
// read `t`. Verified by grepping every one of the former ~113 keys across
// apps/landing/src: zero matches outside this file. Keep this dictionary
// empty rather than deleting the mechanism; `lang`/`setLang` are still live
// (language toggle + path-based /en detection) and a future page-specific
// i18n need can repopulate EN/ES without re-wiring the provider.
// ---------------------------------------------------------------------------

export const EN = {} as const;

export const ES: Translations = {};
