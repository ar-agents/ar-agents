"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLang } from "./i18n";

type Theme = "dark" | "light";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  return stored === "light" ? "light" : "dark";
}

function ToggleShell({
  onClick,
  ariaLabel,
  title,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      style={{
        width: 36,
        height: 36,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 9999,
        background: "var(--bg-tint)",
        color: "var(--text)",
        boxShadow: "var(--shadow-ring-light)",
        cursor: "pointer",
        border: "none",
        padding: 0,
        fontFamily: FONT_MONO,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </button>
  );
}

function ThemeButton() {
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

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const next = theme === "dark" ? "light" : "dark";

  return (
    <ToggleShell
      onClick={toggle}
      ariaLabel={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? (
        <svg
          width="16"
          height="16"
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
      ) : (
        <svg
          width="16"
          height="16"
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
      )}
    </ToggleShell>
  );
}

function LangButton() {
  const { lang, setLang } = useLang();
  const next = lang === "en" ? "es" : "en";
  const label = lang.toUpperCase();
  return (
    <ToggleShell
      onClick={() => setLang(next)}
      ariaLabel={`Switch language to ${next.toUpperCase()}`}
      title={`Switch to ${next.toUpperCase()}`}
    >
      <span style={{ display: "inline-block", lineHeight: 1 }}>{label}</span>
    </ToggleShell>
  );
}

export function Toggles() {
  const pathname = usePathname();
  // /demo route is meant for video recording — hide both toggles.
  if (pathname === "/demo") return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <ThemeButton />
      <LangButton />
    </div>
  );
}
