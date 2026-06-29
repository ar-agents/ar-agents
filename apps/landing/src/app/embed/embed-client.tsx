"use client";

/**
 * Interactive playground for /embed. User pastes a session id and gets
 * the live-rendering badge + per-snippet copy buttons. Pure client
 * component, the badge URL it builds is server-rendered by Vercel.
 */

import { useMemo, useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";

const SAMPLE_SESSION_ID = "4f50ebf2-94ec-4c75-b94a-6e8e1f54f5bc";
const ORIGIN = "https://ar-agents.ar";

export function EmbedClient() {
  const [sid, setSid] = useState(SAMPLE_SESSION_ID);

  const trimmed = sid.trim();
  const isValid = /^[A-Za-z0-9_-]{8,64}$/.test(trimmed);

  const snippets = useMemo(() => {
    const id = isValid ? trimmed : `{sessionId}`;
    return {
      markdown: `![ar-agents audit](${ORIGIN}/api/badge/${id})`,
      html: `<a href="${ORIGIN}/dashboard/${id}"><img src="${ORIGIN}/api/badge/${id}" alt="ar-agents audit" height="20"></a>`,
      iframe: `<iframe src="${ORIGIN}/dashboard/${id}" width="100%" height="640" loading="lazy" sandbox="allow-scripts allow-same-origin" title="ar-agents audit log"></iframe>`,
      curlVerify: `curl ${ORIGIN}/api/play/audit/${id}?verify=1`,
      curlCsv: `curl ${ORIGIN}/api/play/audit/${id}/csv > audit.csv`,
    };
  }, [isValid, trimmed]);

  return (
    <div
      style={{
        background: "var(--bg)",
        padding: 18,
        borderRadius: 8,
        boxShadow:
          "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px",
        marginBottom: 24,
      }}
    >
      <label
        htmlFor="sid"
        style={{
          display: "block",
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        Pegá un session id (UUID o token, 8-64 chars)
      </label>
      <input
        id="sid"
        value={sid}
        onChange={(e) => setSid(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        style={{
          width: "100%",
          background: "var(--bg-tint)",
          color: "var(--text)",
          border: 0,
          borderRadius: 6,
          padding: "10px 14px",
          fontSize: 14,
          fontFamily: FONT_MONO,
          boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
          outline: "none",
          marginBottom: 16,
        }}
      />

      {!isValid && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            fontFamily: FONT_MONO,
            color: "#eab308",
            marginBottom: 12,
          }}
        >
          ⚠ Session id inválido. Debe ser 8-64 chars [A-Za-z0-9_-]. Los
          snippets de abajo usan{" "}
          <code style={{ background: "#fffbe6", padding: "1px 4px" }}>
            {`{sessionId}`}
          </code>{" "}
          como placeholder.
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        Live preview
      </div>
      <div
        style={{
          background: "var(--bg-tint)",
          padding: 16,
          borderRadius: 6,
          boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {isValid ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ORIGIN}/api/badge/${trimmed}`}
              alt="ar-agents audit"
              height={20}
              style={{ display: "inline-block" }}
            />
            <a
              href={`${ORIGIN}/dashboard/${trimmed}`}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 11,
                fontFamily: FONT_MONO,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              ver dashboard ↗
            </a>
          </>
        ) : (
          <span
            style={{
              fontSize: 12,
              fontFamily: FONT_MONO,
              color: "var(--text-muted)",
            }}
          >
            (preview se activa con un session id válido)
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <SnippetBlock label="Markdown" code={snippets.markdown} />
        <SnippetBlock label="HTML (linked)" code={snippets.html} />
        <SnippetBlock label="iframe (live dashboard)" code={snippets.iframe} />
        <SnippetBlock label="Verify (curl)" code={snippets.curlVerify} />
        <SnippetBlock label="CSV export (curl)" code={snippets.curlCsv} />
      </div>
    </div>
  );
}

function SnippetBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // older browsers, silently fail
    }
  };
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          style={{
            marginLeft: "auto",
            background: copied ? "#ebf5ff" : "var(--bg)",
            color: copied ? "#0a72ef" : "var(--text)",
            border: 0,
            borderRadius: 4,
            padding: "2px 10px",
            fontSize: 11,
            fontFamily: FONT_MONO,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: SHADOW_BORDER,
          }}
        >
          {copied ? "copiado ✓" : "copiar"}
        </button>
      </div>
      <pre
        style={{
          background: "var(--bg-tint)",
          padding: 12,
          borderRadius: 6,
          fontSize: 12,
          fontFamily: FONT_MONO,
          color: "var(--text-body)",
          overflow: "auto",
          boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
          margin: 0,
          whiteSpace: "pre",
        }}
      >
        {code}
      </pre>
    </div>
  );
}
