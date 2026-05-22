"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "./i18n";
import { Toggles } from "./toggles";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";

interface NavItem {
  href: { es: string; en: string };
  label: { es: string; en: string };
  /** Path fragments that mark this item as "active". Includes ES + EN
   *  mirror prefixes so the highlight tracks both languages. */
  matchPrefixes: ReadonlyArray<string>;
}

const NAV: ReadonlyArray<NavItem> = [
  {
    href: { es: "/implementacion", en: "/en/implementation" },
    label: { es: "Implementación", en: "Implementation" },
    matchPrefixes: ["/implementacion", "/en/implementation"],
  },
  {
    href: { es: "/sociedades-ia", en: "/en/ai-corporations" },
    label: { es: "Tesis", en: "Thesis" },
    matchPrefixes: ["/sociedades-ia", "/en/ai-corporations"],
  },
  {
    href: { es: "/rfcs/001", en: "/rfcs/001" },
    label: { es: "Spec", en: "Spec" },
    matchPrefixes: ["/rfcs"],
  },
  {
    href: { es: "/play", en: "/play" },
    label: { es: "Demo", en: "Demo" },
    matchPrefixes: ["/play"],
  },
  {
    href: { es: "/registro", en: "/en/registry" },
    label: { es: "Registro", en: "Registry" },
    matchPrefixes: ["/registro", "/en/registry"],
  },
  {
    href: { es: "/sdk", en: "/sdk" },
    label: { es: "SDK", en: "Docs" },
    matchPrefixes: ["/sdk"],
  },
  {
    href: { es: "/auditor", en: "/en/auditor" },
    label: { es: "Auditoría", en: "Policy" },
    matchPrefixes: ["/auditor", "/en/auditor"],
  },
];

function isActive(
  prefixes: ReadonlyArray<string>,
  pathname: string,
): boolean {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function Nav() {
  const pathname = usePathname() ?? "/";
  const { lang } = useLang();

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
          maxWidth: 1100,
          margin: "0 auto",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <ul
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              margin: 0,
              padding: 0,
              listStyle: "none",
              flexWrap: "wrap",
            }}
          >
            {NAV.map((item) => {
              const active = isActive(item.matchPrefixes, pathname);
              const href = item.href[lang];
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    style={{
                      display: "inline-block",
                      padding: "6px 10px",
                      fontSize: 13,
                      textDecoration: "none",
                      color: active ? "var(--text)" : "var(--text-muted)",
                      fontWeight: active ? 600 : 500,
                      borderRadius: 6,
                      background: active
                        ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                        : "transparent",
                    }}
                  >
                    {item.label[lang]}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Toggles />
        </div>
      </div>
    </nav>
  );
}
