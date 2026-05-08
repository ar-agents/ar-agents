// Shared chrome for /manifiesto, /sociedades-ia, /rfcs/001 — keeps
// typography + spacing in lockstep with the homepage without duplicating
// styles into every page.

import type { ReactNode } from "react";
import Link from "next/link";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

interface DocShellProps {
  /** Short uppercased eyebrow above the H1 (e.g., "/arg · manifiesto"). */
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
        padding: "80px 24px 120px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginBottom: 24,
            color: "var(--text-muted)",
            fontSize: 13,
            fontFamily: FONT_MONO,
            textDecoration: "underline",
          }}
        >
          ← /arg
        </Link>
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
            display: "flex",
            justifyContent: "space-between",
            color: "var(--text-muted)",
            fontSize: 13,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span>
            <a
              href="https://github.com/ar-agents/ar-agents"
              style={{
                color: "var(--text-body)",
                textDecoration: "underline",
              }}
            >
              github.com/ar-agents
            </a>
          </span>
          <span>
            MIT ·{" "}
            <a
              href="https://github.com/naza00000"
              style={{
                color: "var(--text-body)",
                textDecoration: "underline",
              }}
            >
              Nazareno Clemente
            </a>
          </span>
        </footer>
      </div>
    </main>
  );
}

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
