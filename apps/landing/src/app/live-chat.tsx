"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ToolUIPart } from "ai";
import { useCallback, useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";

const SUGGESTIONS: ReadonlyArray<{ label: string; prompt: string }> = [
  {
    label: "Suscripción mensual",
    prompt:
      "Creá una subscription mensual de $1500 ARS para nuevo@example.com",
  },
  {
    label: "Cuotas Galicia",
    prompt:
      "Cobrale $30.000 ARS a juan@example.com con su tarjeta Galicia, aplicale las mejores cuotas que tenga",
  },
  {
    label: "Marketplace split",
    prompt:
      "Generá una preference de $8.000 ARS para el seller @ferri, mi platform se lleva 12%",
  },
];

function compactValue(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null) return "null";
  if (Array.isArray(v)) return `[…${v.length}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const inner = entries
      .map(([k, val]) => `${k}: ${compactValue(val)}`)
      .join(", ");
    return `{ ${inner} }`;
  }
  return String(v);
}

function renderUserText(text: string) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
      <span
        style={{
          color: "var(--text-muted)",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        &gt;
      </span>
      <span style={{ color: "var(--text)", whiteSpace: "pre-wrap", flex: 1 }}>
        {text}
      </span>
    </div>
  );
}

// Inline markdown: **bold**, `code`, [text](url), bare URLs.
// One regex with alternation so order is left-to-right and earlier
// patterns win (markdown link beats bare URL inside it).
const MD_INLINE = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)|(https?:\/\/[^\s)]+)/g;

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(MD_INLINE)) {
    if (match.index === undefined) continue;
    if (match.index > last) {
      out.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    }
    if (match[1] && match[2] && match[3]) {
      // [label](url)
      out.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          {match[2]}
        </a>,
      );
    } else if (match[4] && match[5]) {
      // **bold**
      out.push(
        <strong key={key++} style={{ fontWeight: 600, color: "var(--text)" }}>
          {match[5]}
        </strong>,
      );
    } else if (match[6] && match[7]) {
      // `code`
      out.push(
        <code
          key={key++}
          style={{
            fontFamily: FONT_MONO,
            color: "var(--accent)",
            fontSize: "0.94em",
          }}
        >
          {match[7]}
        </code>,
      );
    } else if (match[8]) {
      // bare https URL
      out.push(
        <a
          key={key++}
          href={match[8]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          {match[8]}
        </a>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    out.push(<span key={key++}>{text.slice(last)}</span>);
  }
  return out;
}

// Markdown table helpers.
const tableRowRe = /^\s*\|(.*)\|\s*$/;
const tableSepRe = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;
function parseTableRow(line: string): string[] {
  const m = line.match(tableRowRe);
  if (!m) return [];
  return m[1].split("|").map((c) => c.trim());
}

function renderTable(
  header: string[],
  rows: string[][],
  key: number,
): React.ReactNode {
  return (
    <div
      key={key}
      style={{
        margin: "6px 0",
        borderRadius: 6,
        boxShadow: "var(--shadow-border)",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: FONT_MONO,
          fontSize: 12.5,
        }}
      >
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  color: "var(--text-muted)",
                  fontWeight: 500,
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  boxShadow: "inset 0 -1px 0 var(--border-color)",
                }}
              >
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "8px 12px",
                    color: "var(--text)",
                    boxShadow:
                      ri < rows.length - 1
                        ? "inset 0 -1px 0 var(--border-color)"
                        : "none",
                  }}
                >
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderAssistantText(text: string) {
  // Walk lines once. Recognized block types: tables, bulleted lists,
  // empty lines (spacer), and plain paragraphs.
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;
  let i = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul
        key={key++}
        style={{
          paddingLeft: 18,
          margin: "4px 0",
          color: "var(--text)",
        }}
      >
        {listBuffer.map((item, idx) => (
          <li key={idx} style={{ marginBottom: 2 }}>
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Table: header row + separator + ≥0 data rows.
    if (
      tableRowRe.test(line) &&
      i + 1 < lines.length &&
      tableSepRe.test(lines[i + 1])
    ) {
      flushList();
      const header = parseTableRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && tableRowRe.test(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push(renderTable(header, rows, key++));
      continue;
    }

    // Bullet
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      listBuffer.push(bullet[1]);
      i++;
      continue;
    }

    flushList();

    if (line.length === 0) {
      blocks.push(<div key={key++} style={{ height: "0.5em" }} />);
    } else {
      blocks.push(
        <div key={key++} style={{ color: "var(--text)" }}>
          {renderInline(line)}
        </div>,
      );
    }
    i++;
  }
  flushList();

  return (
    <div
      style={{
        marginTop: 10,
        marginBottom: 14,
        wordBreak: "break-word",
      }}
    >
      {blocks}
    </div>
  );
}

function renderToolPart(part: ToolUIPart, key: string) {
  // ToolUIPart in v6 has a `state` prop with values like "input-streaming",
  // "input-available", "output-available", "output-error".
  const state = part.state;
  const name =
    typeof part.type === "string" && part.type.startsWith("tool-")
      ? part.type.slice("tool-".length)
      : "tool";

  const args = part.input as Record<string, unknown> | undefined;
  const result =
    state === "output-available"
      ? (part.output as Record<string, unknown> | undefined)
      : undefined;

  return (
    <div
      key={key}
      style={{
        marginBottom: 10,
        animation: "demo-fade-in 200ms ease-out",
      }}
    >
      <div style={{ display: "flex", gap: 12 }}>
        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>→</span>
        <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
          <span style={{ color: "var(--accent)", fontWeight: 500 }}>{name}</span>
          <span style={{ color: "var(--text-muted)" }}>
            {args ? `(${compactValue(args).replace(/^\{ ?| ?\}$/g, "")})` : "()"}
          </span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>←</span>
        <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
          {state === "output-available" && result ? (
            <span style={{ color: "var(--text)" }}>{compactValue(result)}</span>
          ) : state === "output-error" ? (
            <span style={{ color: "var(--text-muted)" }}>error</span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>running…</span>
          )}
        </span>
      </div>
    </div>
  );
}

export function LiveChat({ onClose }: { onClose?: () => void } = {}) {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/demo" }),
  });
  const [input, setInput] = useState("");

  const isStreaming = status === "submitted" || status === "streaming";

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      setInput("");
      void sendMessage({ text: trimmed });
    },
    [isStreaming, sendMessage],
  );

  return (
    <div
      style={{
        marginBottom: 32,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        overflow: "hidden",
        animation: "demo-fade-in 240ms ease-out",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          boxShadow: "inset 0 -1px 0 var(--border-color)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: isStreaming ? "var(--accent)" : "var(--text-muted)",
              boxShadow: isStreaming
                ? "0 0 0 4px rgba(0, 188, 255, 0.12)"
                : "none",
              animation: isStreaming
                ? "demo-pulse 2s ease-in-out infinite"
                : "none",
            }}
          />
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: "var(--text-muted)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {isStreaming ? "live · streaming" : "live · ready"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: "var(--text-muted)",
              letterSpacing: "0.06em",
            }}
          >
            anthropic/claude-sonnet-4-6 · vercel ai gateway
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close live demo"
              title="Close"
              style={{
                width: 24,
                height: 24,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9999,
                background: "transparent",
                color: "var(--text-muted)",
                border: "none",
                cursor: "pointer",
                padding: 0,
                boxShadow: "var(--shadow-ring-light)",
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div
        style={{
          padding: "16px 22px 8px",
          fontFamily: FONT_MONO,
          fontSize: 13,
          lineHeight: 1.65,
          minHeight: 220,
          maxHeight: 480,
          overflowY: "auto",
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              fontFamily: FONT_SANS,
              marginBottom: 14,
            }}
          >
            Pedile que cobre, suscriba, o calcule cuotas. Real Claude
            Sonnet 4.6 vía Vercel AI Gateway + tools mockeados (no se
            cobran cuentas reales).
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id}>
            {message.parts.map((part, i) => {
              const partKey = `${message.id}-${i}`;
              if (part.type === "text") {
                return message.role === "user" ? (
                  <div key={partKey}>{renderUserText(part.text)}</div>
                ) : (
                  <div key={partKey}>{renderAssistantText(part.text)}</div>
                );
              }
              if (typeof part.type === "string" && part.type.startsWith("tool-")) {
                return renderToolPart(part as ToolUIPart, partKey);
              }
              return null;
            })}
          </div>
        ))}

        {error ? (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              fontFamily: FONT_SANS,
              padding: "8px 0",
            }}
          >
            {(error as Error).message?.includes("rate")
              ? "Rate-limited. Esperá un par de minutos y probá de nuevo."
              : "Live demo currently unavailable. Recargá o probá los scenarios scripted arriba."}
          </div>
        ) : null}
      </div>

      {messages.length === 0 ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            padding: "0 22px 12px",
          }}
        >
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => send(s.prompt)}
              disabled={isStreaming}
              style={{
                padding: "5px 10px",
                background: "var(--bg)",
                color: "var(--text-body)",
                fontFamily: FONT_MONO,
                fontSize: 11,
                border: "none",
                borderRadius: 9999,
                cursor: isStreaming ? "default" : "pointer",
                opacity: isStreaming ? 0.5 : 1,
                boxShadow: "var(--shadow-ring-light)",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 14px 14px",
          boxShadow: "inset 0 1px 0 var(--border-color)",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Probá pedirle algo en español o inglés…"
          disabled={isStreaming}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "var(--bg)",
            color: "var(--text)",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: FONT_MONO,
            boxShadow: "var(--shadow-ring-light)",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          style={{
            padding: "8px 14px",
            background: "var(--primary-bg)",
            color: "var(--primary-text)",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: FONT_SANS,
            fontWeight: 500,
            cursor: isStreaming || !input.trim() ? "default" : "pointer",
            opacity: isStreaming || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
