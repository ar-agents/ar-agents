"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useLang } from "./i18n";
import { Toggles } from "./toggles";
import { LAW_STATUS } from "./law-status";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";

interface NavItem {
  href: { es: string; en: string };
  label: { es: string; en: string };
  /** Path fragments that mark this item as "active". Includes ES + EN
   *  mirror prefixes so the highlight tracks both languages. */
  matchPrefixes: ReadonlyArray<string>;
}

// Simplified to the relaunch IA: one promise, five sections. See RELAUNCH-SCOPE.md.
const NAV: ReadonlyArray<NavItem> = [
  {
    href: { es: "/sociedades-ia", en: "/en/ai-corporations" },
    label: { es: "Cómo funciona", en: "How it works" },
    matchPrefixes: ["/sociedades-ia", "/en/ai-corporations", "/como-funciona"],
  },
  {
    href: { es: "/play", en: "/play" },
    label: { es: "Demo", en: "Demo" },
    matchPrefixes: ["/play", "/demo"],
  },
  {
    href: { es: "/precios", en: "/en/pricing" },
    label: { es: "Precios", en: "Pricing" },
    matchPrefixes: ["/precios", "/en/pricing"],
  },
  {
    href: { es: "/docs", en: "/docs" },
    label: { es: "Docs", en: "Docs" },
    matchPrefixes: ["/docs", "/sdk", "/reference", "/examples"],
  },
  {
    href: { es: "/ley", en: "/ley" },
    label: { es: "La ley", en: "The law" },
    matchPrefixes: ["/ley", "/legislacion", "/en/legislation", "/rfcs"],
  },
];

function isActive(
  prefixes: ReadonlyArray<string>,
  pathname: string,
): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function Nav() {
  const pathname = usePathname() ?? "/";
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on route change so the panel never lingers after navigating.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape and on click/tap outside the menu cluster.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const menuLabel = lang === "es" ? "Menú" : "Menu";
  const ctaLabel =
    LAW_STATUS === "live"
      ? lang === "es"
        ? "Crear sociedad"
        : "Create company"
      : lang === "es"
        ? "Empezar"
        : "Get started";

  return (
    <nav
      aria-label="Primary"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        backdropFilter: "saturate(180%) blur(8px)",
        WebkitBackdropFilter: "saturate(180%) blur(8px)",
        borderBottom: "1px solid var(--border-color, rgba(0,0,0,0.08))",
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          width: "100%",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Link
          href="/"
          aria-label="ar-agents home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            color: "var(--text)",
            fontFamily: FONT_MONO,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: "var(--accent)",
              flexShrink: 0,
            }}
          />
          ar-agents
        </Link>

        <div className="nav-links-desktop" style={{ alignItems: "center", gap: 24 }}>
          {NAV.map((item) => {
            const active = isActive(item.matchPrefixes, pathname);
            const href = item.href[lang];
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                style={{
                  fontSize: 14,
                  textDecoration: "none",
                  color: active ? "var(--text)" : "var(--text-body)",
                  fontWeight: active ? 600 : 500,
                  whiteSpace: "nowrap",
                }}
              >
                {item.label[lang]}
              </Link>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href="/incorporar"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 30,
              padding: "0 14px",
              background: "var(--primary-bg)",
              color: "var(--primary-text)",
              borderRadius: 9999,
              textDecoration: "none",
              fontFamily: FONT_SANS,
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {ctaLabel}
          </Link>
          <Toggles />

          {/* Menu cluster: button + dropdown panel. Relatively positioned so
              the panel anchors to it; wrapRef covers both for click-outside. */}
          <div ref={wrapRef} className="nav-menu-mobile" style={{ position: "relative" }}>
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={open}
              aria-controls={menuId}
              aria-label={menuLabel}
              onClick={() => setOpen((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                height: 30,
                padding: "0 12px",
                background: open ? "var(--bg-tint)" : "transparent",
                color: "var(--text)",
                border: "none",
                borderRadius: 9999,
                boxShadow: "var(--shadow-ring-light)",
                cursor: "pointer",
                fontFamily: FONT_MONO,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.02em",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                {open ? (
                  <>
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </>
                ) : (
                  <>
                    <path d="M3 6h18" />
                    <path d="M3 12h18" />
                    <path d="M3 18h18" />
                  </>
                )}
              </svg>
              {menuLabel}
            </button>

            {open && (
              <div
                id={menuId}
                aria-label={menuLabel}
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  minWidth: 200,
                  maxWidth: "min(280px, calc(100vw - 32px))",
                  background: "var(--bg)",
                  border: "1px solid var(--border-color, rgba(0,0,0,0.1))",
                  borderRadius: 12,
                  boxShadow: "var(--card-shadow)",
                  padding: 6,
                  display: "grid",
                  gap: 1,
                }}
              >
                {NAV.map((item) => {
                  const active = isActive(item.matchPrefixes, pathname);
                  const href = item.href[lang];
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      style={{
                        display: "block",
                        padding: "9px 12px",
                        fontSize: 14,
                        textDecoration: "none",
                        color: active ? "var(--text)" : "var(--text-body)",
                        fontWeight: active ? 600 : 500,
                        borderRadius: 8,
                        background: active
                          ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                          : "transparent",
                      }}
                    >
                      {item.label[lang]}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
