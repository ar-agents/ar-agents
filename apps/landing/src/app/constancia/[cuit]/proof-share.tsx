"use client";

/**
 * Embed + share controls for the Constancia Oracle proof page.
 *
 * The embed snippet (markdown + HTML img) is what propagates the badge loop:
 * an operator pastes it into a README / profile / status page, and every
 * render of that badge hits /api/constancia/badge/[cuit], which logs the
 * embedding Referer (the k-factor metric). Making the snippet trivial to copy
 * is, directly, the growth lever this experiment measures.
 */

import { useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard blocked, no-op (the text is visible to select manually)
        }
      }}
      style={{
        fontSize: 12,
        fontFamily: FONT_MONO,
        padding: "5px 10px",
        borderRadius: 7,
        border: "1px solid var(--border-color)",
        background: "var(--bg)",
        color: copied ? "var(--success)" : "var(--text)",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      aria-label={`Copiar ${label}`}
    >
      {copied ? "copiado ✓" : `copiar ${label}`}
    </button>
  );
}

function Snippet({
  caption,
  code,
  copyLabel,
}: {
  caption: string;
  code: string;
  copyLabel: string;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {caption}
        </span>
        <CopyButton text={code} label={copyLabel} />
      </div>
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          borderRadius: 8,
          background: "var(--bg-tint)",
          border: "1px solid var(--border-color)",
          fontFamily: FONT_MONO,
          fontSize: 12,
          lineHeight: 1.5,
          overflowX: "auto",
          color: "var(--text-body)",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ProofShare({
  badgeUrl,
  proofUrl,
  pretty,
  valid,
}: {
  badgeUrl: string;
  proofUrl: string;
  pretty: string;
  valid: boolean;
}) {
  const markdown = `[![constancia](${badgeUrl})](${proofUrl})`;
  const html = `<a href="${proofUrl}"><img src="${badgeUrl}" alt="constancia" height="20"></a>`;

  const shareText = `Constancia del CUIT ${pretty}: ${valid ? "válida" : "no válida"}. Verificado por ar-agents.`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText,
  )}&url=${encodeURIComponent(proofUrl)}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(
    `${shareText} ${proofUrl}`,
  )}`;

  return (
    <section style={{ marginTop: 30 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}
      >
        Copiá el badge
      </h2>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 14,
          color: "var(--text-body)",
          lineHeight: 1.55,
        }}
      >
        Pegalo donde afirmes este CUIT: README, perfil, página de proveedor.
        Se actualiza solo.
      </p>

      <Snippet caption="Markdown" code={markdown} copyLabel="markdown" />
      <Snippet caption="HTML" code={html} copyLabel="html" />

      <div
        style={{
          marginTop: 20,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={shareBtn}
        >
          Compartir en X
        </a>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={shareBtn}
        >
          Compartir por WhatsApp
        </a>
        <CopyButton text={proofUrl} label="link" />
      </div>
    </section>
  );
}

const shareBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid var(--border-color)",
  background: "var(--bg)",
  color: "var(--text)",
  cursor: "pointer",
};
