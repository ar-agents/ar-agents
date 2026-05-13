import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "404 · Not found",
  description: "The page you're looking for doesn't exist on ar-agents.ar.",
  robots: { index: false, follow: false },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";

const SHORTCUTS = [
  { href: "/play", label: "/play", desc: "Live sociedad-IA agent demo" },
  { href: "/reference", label: "/reference", desc: "Every URL on the site" },
  { href: "/sdk", label: "/sdk", desc: "@ar-agents/incorporate docs" },
  { href: "/faq", label: "/faq", desc: "21 questions answered" },
  { href: "/sociedades-ia", label: "/sociedades-ia", desc: "Regime alignment" },
  { href: "/rfcs/001", label: "/rfcs/001", desc: "Three-layer liability framework" },
];

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fff",
        color: "#171717",
        padding: "64px 24px",
        fontFamily:
          "var(--font-geist-sans), Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ maxWidth: 720, width: "100%" }}>
        <p
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: 0,
          }}
        >
          404
        </p>
        <h1
          style={{
            fontSize: 88,
            fontWeight: 600,
            color: "#171717",
            letterSpacing: "-3.52px",
            lineHeight: 0.95,
            margin: "8px 0 12px",
            fontFamily: FONT_MONO,
          }}
        >
          404
        </h1>
        <p
          style={{
            fontSize: 18,
            color: "#4d4d4d",
            lineHeight: 1.5,
            margin: "0 0 32px",
            maxWidth: 520,
          }}
        >
          La URL que pediste no existe en ar-agents.ar. Puede que sea
          una vieja URL de pre-rebrand, o un session id inválido, o un typo.
        </p>

        <h2
          style={{
            fontSize: 13,
            fontFamily: FONT_MONO,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
            margin: "0 0 12px",
          }}
        >
          Atajos útiles
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(140px, 200px) 1fr",
                gap: 12,
                padding: "10px 14px",
                background: "#fff",
                borderRadius: 6,
                boxShadow: SHADOW_BORDER,
                textDecoration: "none",
                color: "inherit",
                alignItems: "baseline",
              }}
            >
              <code
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 13,
                  color: "#171717",
                  fontWeight: 500,
                }}
              >
                {s.label}
              </code>
              <span style={{ fontSize: 13, color: "#4d4d4d" }}>{s.desc}</span>
            </Link>
          ))}
        </div>

        <p
          style={{
            marginTop: 32,
            fontSize: 13,
            color: "#666",
            lineHeight: 1.6,
          }}
        >
          Si llegaste acá desde un link nuestro que está roto, abrí un{" "}
          <a
            href="https://github.com/ar-agents/ar-agents/issues/new?labels=bug&template=bug_report.yml"
            style={{ color: "#0072f5" }}
          >
            issue
          </a>{" "}
          o mandanos un email a{" "}
          <a href="mailto:clementenaza@gmail.com" style={{ color: "#0072f5" }}>
            clementenaza@gmail.com
          </a>
          . Toda 404 es un bug.
        </p>
      </div>
    </main>
  );
}
