// Shared chrome for doc-style pages, keeps typography + spacing in
// lockstep with the homepage without duplicating styles into every page.
// Top navigation is provided globally by <Nav /> in layout.tsx, so this
// shell renders just the article column.

import type { ReactNode } from "react";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

interface DocShellProps {
  /** Short uppercased eyebrow above the H1 (e.g., "manifiesto · 2026-05"). */
  eyebrow: string;
  title: string;
  /** Optional subtitle (deck) under the H1. */
  subtitle?: string;
  children: ReactNode;
}

export function DocShell({ eyebrow, title, subtitle, children }: DocShellProps) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: FONT_SANS,
        color: "var(--text)",
        padding: "56px 24px 120px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "var(--accent)",
            margin: 0,
            fontFamily: FONT_MONO,
            fontWeight: 600,
          }}
        >
          {eyebrow}
        </p>
        <h1
          style={{
            fontSize: "clamp(32px, 6vw, 44px)",
            margin: "16px 0 16px",
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: "-0.04em",
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              color: "var(--text-body)",
              fontSize: "clamp(16px, 2.4vw, 19px)",
              margin: "0 0 40px",
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            {subtitle}
          </p>
        ) : (
          <div style={{ marginBottom: 32 }} />
        )}
        <article
          className="doc-prose"
          style={{
            color: "var(--text-body)",
            fontSize: 16,
            lineHeight: 1.7,
          }}
        >
          {children}
        </article>
        <hr
          style={{
            border: "none",
            borderTop: "1px solid var(--border-color)",
            margin: "56px 0 24px",
          }}
        />
        <footer
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            display: "grid",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              fontFamily: FONT_MONO,
              fontSize: 12,
            }}
          >
            <a href="/" style={shellLinkSty}>/</a>
            <a href="/sociedades-ia" style={shellLinkSty}>thesis</a>
            <a href="/rfcs/001" style={shellLinkSty}>spec</a>
            <a href="/registro" style={shellLinkSty}>registry</a>
            <a href="/auditor" style={shellLinkSty}>auditor</a>
            <a href="/precios" style={shellLinkSty}>precios</a>
            <a href="/legislacion" style={shellLinkSty}>legislación</a>
            <a href="/sdk" style={shellLinkSty}>sdk</a>
            <a href="/faq" style={shellLinkSty}>faq</a>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              paddingTop: 8,
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <span>
              MIT (code) + CC-BY-4.0 (specs) ·{" "}
              <a
                href="https://github.com/naza00000"
                style={shellLinkSty}
              >
                Nazareno Clemente
              </a>
            </span>
            <span>
              <a
                href="https://github.com/ar-agents/ar-agents"
                style={shellLinkSty}
              >
                github.com/ar-agents
              </a>
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}

const shellLinkSty: React.CSSProperties = {
  color: "var(--text-body)",
  textDecoration: "underline",
};

/** Minimal H2 to use inside DocShell without breaking the prose rhythm. */
export function DocH2({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "clamp(20px, 3vw, 24px)",
        fontWeight: 600,
        margin: "40px 0 12px",
        letterSpacing: "-0.02em",
        color: "var(--text)",
      }}
    >
      {children}
    </h2>
  );
}

export function DocP({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: "0 0 16px", color: "var(--text-body)" }}>{children}</p>
  );
}

export function DocCode({ children }: { children: ReactNode }) {
  return (
    <code
      style={{
        background: "var(--bg-tint)",
        padding: "2px 6px",
        borderRadius: 4,
        fontFamily: FONT_MONO,
        fontSize: "0.9em",
        color: "var(--text)",
      }}
    >
      {children}
    </code>
  );
}

export function DocBlock({ children }: { children: ReactNode }) {
  return (
    <pre
      style={{
        background: "var(--code-bg)",
        color: "var(--code-text)",
        padding: 20,
        borderRadius: 8,
        overflow: "auto",
        fontSize: 13,
        lineHeight: 1.6,
        fontFamily: FONT_MONO,
        margin: "16px 0 24px",
        boxShadow: "var(--shadow-border)",
      }}
    >
      {children}
    </pre>
  );
}
