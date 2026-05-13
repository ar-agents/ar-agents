"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang, type Lang } from "./i18n";

type Theme = "dark" | "light";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  return stored === "light" ? "light" : "dark";
}

type Option<T extends string> = {
  value: T;
  label: React.ReactNode;
  ariaLabel: string;
};

function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        background: "var(--bg-tint)",
        borderRadius: 9999,
        padding: 3,
        boxShadow: "var(--shadow-ring-light)",
        gap: 0,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            aria-label={opt.ariaLabel}
            title={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "0 10px",
              minWidth: 30,
              height: 24,
              background: active ? "var(--primary-bg)" : "transparent",
              color: active ? "var(--primary-text)" : "var(--text-muted)",
              border: "none",
              borderRadius: 9999,
              fontSize: 11,
              fontFamily: FONT_MONO,
              fontWeight: 500,
              letterSpacing: "0.04em",
              cursor: active ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition:
                "background 160ms ease-out, color 160ms ease-out",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readInitialTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [mounted, theme]);

  const sunIcon = (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );

  const moonIcon = (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );

  return (
    <Segmented<Theme>
      ariaLabel="Theme"
      value={theme}
      onChange={setTheme}
      options={[
        { value: "dark", label: moonIcon, ariaLabel: "Dark mode" },
        { value: "light", label: sunIcon, ariaLabel: "Light mode" },
      ]}
    />
  );
}

/**
 * Map between the canonical URL (Spanish default) and its /en/* mirror.
 * Add entries here as bilingual page pairs are shipped. When the user
 * toggles, we navigate to the equivalent path so SEO sees one canonical
 * URL per language AND the toggle stays effectively-instant via Next's
 * client-side router + prefetch.
 *
 * Pages NOT listed here fall back to a state context flip (no
 * navigation), the existing /home behavior. That handles the case where
 * a page has inline bilingual copy via `useLang()`.
 */
const ES_TO_EN: Record<string, string> = {
  // Only list pages whose /en/* mirror physically exists. Append as
  // new bilingual page pairs ship; keep alphabetical.
  "/al-ministro": "/en/to-the-minister",
  "/auditor": "/en/auditor",
  "/cloud": "/en/cloud",
  "/co-firmar": "/en/co-sign",
  "/economia-del-regimen": "/en/regime-economics",
  "/gobierno": "/en/government",
  "/jurisdicciones": "/en/jurisdictions",
  "/legislacion": "/en/legislation",
  "/manifiesto": "/en/manifesto",
  "/registro": "/en/registry",
  "/sociedades-ia": "/en/ai-corporations",
  "/vs-on-chain": "/en/vs-on-chain",
};

const EN_TO_ES: Record<string, string> = Object.fromEntries(
  Object.entries(ES_TO_EN).map(([es, en]) => [en, es]),
);

function pathForLang(currentPath: string, targetLang: Lang): string | null {
  // Normalize trailing slashes (except for the root).
  const normalized =
    currentPath !== "/" && currentPath.endsWith("/")
      ? currentPath.slice(0, -1)
      : currentPath;

  if (targetLang === "en") {
    // Already on /en/* path? No navigation needed.
    if (EN_TO_ES[normalized]) return null;
    return ES_TO_EN[normalized] ?? null;
  }
  // targetLang === "es"
  if (ES_TO_EN[normalized] !== undefined && !EN_TO_ES[normalized]) return null;
  return EN_TO_ES[normalized] ?? null;
}

function LangSwitch() {
  const { lang, setLang } = useLang();
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const handleChange = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    const target = pathForLang(pathname, next);
    if (target && target !== pathname) {
      router.push(target);
    }
    // No target means: the current page handles bilingual inline (via
    // useLang()) and just re-renders. No navigation.
  };

  return (
    <Segmented<Lang>
      ariaLabel="Language"
      value={lang}
      onChange={handleChange}
      options={[
        { value: "es", label: "ES", ariaLabel: "Español" },
        { value: "en", label: "EN", ariaLabel: "English" },
      ]}
    />
  );
}

/**
 * Inline toggles for use inside the top nav. No fixed positioning,
 * the caller decides layout.
 */
export function Toggles() {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <ThemeSwitch />
      <LangSwitch />
    </div>
  );
}
