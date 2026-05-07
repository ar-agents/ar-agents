"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  return stored === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const pathname = usePathname();
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

  // /demo route is meant for video recording — hide the toggle.
  if (pathname === "/demo") return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 50,
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
        fontFamily: "inherit",
      }}
    >
      {/* Sun (shown in dark mode → click to go light) */}
      {/* Moon (shown in light mode → click to go dark) */}
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
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
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        )}
      </span>
    </button>
  );
}
