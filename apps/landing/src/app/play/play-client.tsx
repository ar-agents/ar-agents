"use client";

/**
 * /play, interactive sociedad-IA demo.
 *
 * Layout: chat-pane on the left, audit-log on the right. The audit log
 * mirrors what an RFC-001-compliant deployment would record, tool name,
 * input, output, timestamp, and the governance class (algorithm-only,
 * mocked-upstream, audit-logged, requires-confirmation).
 *
 * Design: Vercel-grade chrome, Geist Sans + Geist Mono, shadow-as-border,
 * three-weight system, achromatic palette with workflow accents only on
 * compliance pills.
 */

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIT_TOOL_META,
  type ToolGovernance,
  GOVERNANCE_LABEL,
  GOVERNANCE_COLOR,
  SCENARIOS,
} from "./scenarios";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

// Theme-aware design tokens, use globals.css CSS vars so /play tracks
// the user's dark/light preference like the rest of the site.
const SHADOW_BORDER = "var(--shadow-border)";
const SHADOW_CARD = "var(--card-shadow)";

// WCAG-friendly screen-reader-only style for off-screen labels.
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

interface AuditEntry {
  id: string;
  toolName: string;
  governance: ToolGovernance;
  args: unknown;
  result?: unknown;
  errored?: boolean;
  startedAt: number;
  completedAt?: number;
}

type ChatPart =
  | { type: "text"; text?: string }
  | {
      type: string;
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
      state?: string;
      [k: string]: unknown;
    };

function generateSessionId(): string {
  // 22-char base64 → meets isSessionIdValid regex on the server.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
}

export function PlayClient() {
  // One stable session id per page-load. Pass via custom header so the
  // server writes audit entries under it; render the URL in the UI so the
  // user (or the journalist they emailed it to) can fetch the signed log.
  const sessionId = useMemo(generateSessionId, []);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/play",
        headers: { "x-play-session": sessionId },
      }),
    [sessionId],
  );
  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
  });

  const [input, setInput] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [backend, setBackend] = useState<"vercel-kv" | "in-memory" | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const auditRef = useRef<HTMLDivElement>(null);

  // Probe the audit endpoint to learn which backend is wired (vercel-kv
  // vs in-memory). Doesn't gate the demo, but surfacing the state lets a
  // regulator know they're seeing the production path or the fallback.
  useEffect(() => {
    let alive = true;
    fetch(`/api/play/audit/${sessionId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { backend?: "vercel-kv" | "in-memory" }) => {
        if (alive && j.backend) setBackend(j.backend);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  // Build the audit log from message tool parts. Each tool-call goes through
  // the AI SDK 6 part lifecycle: input-available → output-available.
  useEffect(() => {
    const next: AuditEntry[] = [];
    for (const m of messages) {
      const parts = (m.parts ?? []) as Array<Record<string, unknown>>;
      for (const part of parts) {
        const partType = part.type;
        if (typeof partType !== "string" || !partType.startsWith("tool-")) continue;
        const toolName = partType.slice("tool-".length);
        const meta = AUDIT_TOOL_META[toolName] ?? {
          governance: "audit-logged" as ToolGovernance,
        };
        const id = String(part.toolCallId ?? `${m.id}-${toolName}`);
        const existingIdx = next.findIndex((e) => e.id === id);
        const base: AuditEntry = {
          id,
          toolName,
          governance: meta.governance,
          args: part.input,
          startedAt:
            existingIdx >= 0 ? next[existingIdx]!.startedAt : Date.now(),
        };
        if (part.output !== undefined) {
          base.result = part.output;
          base.completedAt = Date.now();
        }
        if (part.state === "output-error") {
          base.errored = true;
          base.completedAt = Date.now();
        }
        if (existingIdx >= 0) next[existingIdx] = { ...next[existingIdx]!, ...base };
        else next.push(base);
      }
    }
    setAudit(next);
  }, [messages]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = auditRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [audit]);

  const submit = (text: string) => {
    if (!text.trim()) return;
    sendMessage({ text });
    setInput("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const reset = () => {
    setMessages([]);
    setAudit([]);
  };

  const isStreaming = status === "submitted" || status === "streaming";
  const visibleMessages = messages.filter((m) => m.role !== "system");

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "32px 24px 80px",
      }}
    >
      <Header />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
          gap: 24,
          marginTop: 24,
        }}
      >
        {/* CHAT PANE */}
        <section
          aria-label="Conversación con la sociedad automatizada"
          style={{
            background: "var(--bg)",
            borderRadius: 8,
            boxShadow: SHADOW_CARD,
            display: "flex",
            flexDirection: "column",
            minHeight: 560,
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              boxShadow: `inset 0 -1px 0 0 var(--border-color)`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Pill color="var(--accent)" bg="var(--accent-bg)">
              ACME-AI SAS · sandbox
            </Pill>
            <span
              style={{
                fontSize: 11,
                fontFamily: FONT_MONO,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              modelo: claude-sonnet-4-6 · vercel ai gateway
            </span>
            <button
              type="button"
              onClick={reset}
              style={{
                marginLeft: "auto",
                background: "var(--bg)",
                color: "var(--text)",
                border: 0,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                fontFamily: FONT_MONO,
                fontWeight: 500,
                cursor: "pointer",
                boxShadow: "var(--shadow-ring-light)",
              }}
            >
              reset
            </button>
          </div>

          <div
            ref={messagesRef}
            role="log"
            aria-live="polite"
            aria-label="Conversación con el agente"
            style={{
              flex: 1,
              padding: 20,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              minHeight: 320,
            }}
          >
            {visibleMessages.length === 0 && <EmptyState onPick={submit} />}
            {visibleMessages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isStreaming && (
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  letterSpacing: "0.04em",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    marginRight: 6,
                    animation: "pulse 1s ease-in-out infinite",
                  }}
                />
                pensando…
              </div>
            )}
            {error && (
              <div
                role="alert"
                style={{
                  background: "var(--danger-bg)",
                  color: "var(--danger)",
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: FONT_MONO,
                  boxShadow: "var(--danger) 0px 0px 0px 1px",
                }}
              >
                {error.message}
              </div>
            )}
          </div>

          <form
            onSubmit={onSubmit}
            style={{
              padding: 16,
              boxShadow: "inset 0 1px 0 0 var(--border-color)",
              display: "flex",
              gap: 8,
            }}
            aria-label="Enviar prompt al agente"
          >
            <label htmlFor="play-prompt" style={visuallyHidden}>
              Prompt para el agente
            </label>
            <input
              id="play-prompt"
              name="prompt"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isStreaming}
              placeholder='Probá: "Cobrale $75.000 a Acme SRL CUIT 30-12345678-9"'
              autoFocus
              autoComplete="off"
              aria-describedby="play-prompt-hint"
              maxLength={2000}
              style={{
                flex: 1,
                background: "var(--bg)",
                color: "var(--text)",
                border: 0,
                borderRadius: 6,
                padding: "10px 14px",
                fontSize: 14,
                fontFamily: "inherit",
                boxShadow: "var(--shadow-ring-light)",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow =
                  "hsla(212, 100%, 48%, 1) 0px 0px 0px 2px";
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow =
                  "var(--shadow-ring-light)";
              }}
            />
            <span id="play-prompt-hint" style={visuallyHidden}>
              Máximo 2000 caracteres. Enter para enviar.
            </span>
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              aria-busy={isStreaming}
              style={{
                background:
                  isStreaming || !input.trim() ? "var(--border-color)" : "var(--text)",
                color: isStreaming || !input.trim() ? "var(--text-muted)" : "var(--bg)",
                border: 0,
                borderRadius: 6,
                padding: "10px 16px",
                fontSize: 14,
                fontFamily: "inherit",
                fontWeight: 500,
                cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
              }}
            >
              {isStreaming ? "···" : "Enviar →"}
            </button>
          </form>
        </section>

        {/* AUDIT LOG PANE */}
        <aside
          aria-label="Audit log RFC-001"
          style={{
            background: "var(--bg)",
            borderRadius: 8,
            boxShadow: SHADOW_CARD,
            display: "flex",
            flexDirection: "column",
            minHeight: 560,
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              boxShadow: `inset 0 -1px 0 0 var(--border-color)`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: FONT_MONO,
                color: "var(--text)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
              }}
            >
              audit log · RFC-001 § 9
            </span>
            <a
              href={`/dashboard/${sessionId}`}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 10,
                fontFamily: FONT_MONO,
                color: "var(--accent)",
                textDecoration: "none",
                marginLeft: 4,
                fontWeight: 500,
              }}
            >
              ver dashboard ↗
            </a>
            {backend && (
              <Pill
                color={backend === "vercel-kv" ? "var(--accent)" : "var(--text-muted)"}
                bg={backend === "vercel-kv" ? "var(--accent-bg)" : "var(--bg-tint)"}
              >
                {backend}
              </Pill>
            )}
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                fontFamily: FONT_MONO,
                color: "var(--text-muted)",
              }}
            >
              {audit.length} {audit.length === 1 ? "entrada" : "entradas"}
            </span>
          </div>

          <div
            ref={auditRef}
            role="log"
            aria-live="polite"
            aria-label="Audit log RFC-001"
            style={{
              flex: 1,
              padding: 12,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {audit.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  padding: 16,
                  fontFamily: FONT_MONO,
                  lineHeight: 1.55,
                }}
              >
                Cada tool call que invoque la sociedad automatizada va a aparecer acá con
                timestamp, input, output, y la clasificación de governance
                (RFC-001 § 9.2, append-only, HMAC-signed timestamps).
              </div>
            ) : (
              audit.map((entry) => <AuditEntryCard key={entry.id} entry={entry} />)
            )}
          </div>
        </aside>
      </div>

      {/* SCENARIOS */}
      <section style={{ marginTop: 32 }}>
        <h2
          style={{
            fontSize: 14,
            fontFamily: FONT_MONO,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: "0 0 12px",
            fontWeight: 600,
          }}
        >
          Escenarios sugeridos
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 10,
          }}
        >
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => submit(s.prompt)}
              disabled={isStreaming}
              style={{
                background: "var(--bg)",
                color: "var(--text)",
                border: 0,
                borderRadius: 8,
                padding: "12px 14px",
                fontSize: 13,
                fontFamily: "inherit",
                lineHeight: 1.4,
                cursor: isStreaming ? "not-allowed" : "pointer",
                boxShadow: SHADOW_BORDER,
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {s.label}
              </span>
              <span style={{ color: "var(--text-body)" }}>{s.prompt}</span>
            </button>
          ))}
        </div>
      </section>

      <FooterNotes sessionId={sessionId} />

      <style jsx global>{`
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <p
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: 0,
          }}
        >
          play · sociedad automatizada en vivo
        </p>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 600,
            color: "var(--text)",
            letterSpacing: "-2.4px",
            lineHeight: 1.0,
            margin: 0,
          }}
        >
          Una sociedad automatizada argentina,
          <br />
          operando en tiempo real.
        </h1>
      </div>
      <p
        style={{
          marginLeft: "auto",
          maxWidth: 360,
          fontSize: 14,
          color: "var(--text-body)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Mock end-to-end de lo que el proyecto Sturzenegger del 28-abr-2026
        propone. Tools sandbox, no toca APIs reales. Diseñado para que un
        asesor pueda probarlo en 30 segundos sin setup.
      </p>
    </header>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "32px 16px",
        color: "var(--text-body)",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 12,
        }}
      >
        sandbox · cero setup · cero datos reales
      </div>
      <p style={{ margin: 0, color: "var(--text)", fontSize: 16, fontWeight: 500 }}>
        Escribí un pedido como si fueras el dueño humano de ACME-AI SAS.
      </p>
      <p style={{ margin: "8px 0 24px", color: "var(--text-body)" }}>
        El agente va a usar las 13 tools del stack <code style={{ fontFamily: FONT_MONO }}>@ar-agents/*</code> para resolverlo, y cada tool call va a aparecer en el audit log →
      </p>
      <button
        type="button"
        onClick={() => onPick(SCENARIOS[0]!.prompt)}
        style={{
          background: "var(--text)",
          color: "var(--bg)",
          border: 0,
          borderRadius: 6,
          padding: "10px 18px",
          fontSize: 14,
          fontFamily: "inherit",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Probá el primer escenario →
      </button>
    </div>
  );
}

function MessageBubble({ message }: { message: { role: string; parts?: ChatPart[] } }) {
  const isUser = message.role === "user";
  const text = (message.parts ?? [])
    .filter((p): p is ChatPart & { type: "text"; text?: string } => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
  if (!text.trim()) return null;
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        background: isUser ? "var(--text)" : "var(--bg-tint)",
        color: isUser ? "var(--bg)" : "var(--text)",
        padding: "10px 14px",
        borderRadius: 12,
        boxShadow: isUser ? "none" : SHADOW_BORDER,
        fontSize: 14,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text}
    </div>
  );
}

function AuditEntryCard({ entry }: { entry: AuditEntry }) {
  const tone = GOVERNANCE_COLOR[entry.governance];
  const label = GOVERNANCE_LABEL[entry.governance];
  const elapsed =
    entry.completedAt && entry.startedAt
      ? entry.completedAt - entry.startedAt
      : null;
  return (
    <article
      style={{
        background: "var(--bg)",
        padding: "10px 12px",
        borderRadius: 6,
        boxShadow: SHADOW_BORDER,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <code
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            color: "var(--text)",
            fontWeight: 500,
          }}
        >
          {entry.toolName}
        </code>
        <Pill color={tone.fg} bg={tone.bg}>
          {label}
        </Pill>
        {elapsed !== null && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: "var(--text-muted)",
            }}
          >
            {elapsed}ms
          </span>
        )}
      </div>
      <details>
        <summary
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: "var(--text-muted)",
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          input / output
        </summary>
        <pre
          style={{
            background: "var(--bg-tint)",
            padding: 8,
            borderRadius: 4,
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: "var(--text-body)",
            margin: "6px 0 0",
            overflowX: "auto",
            boxShadow: "var(--shadow-ring-light)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify({ input: entry.args, output: entry.result }, null, 2)}
        </pre>
      </details>
    </article>
  );
}

function Pill({
  children,
  color,
  bg,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        background: bg,
        color,
        borderRadius: 9999,
        padding: "1px 10px",
        fontSize: 11,
        fontFamily: FONT_MONO,
        fontWeight: 500,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function FooterNotes({ sessionId }: { sessionId: string }) {
  return (
    <footer
      style={{
        marginTop: 48,
        padding: "16px 18px",
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
        fontSize: 13,
        color: "var(--text-body)",
        lineHeight: 1.6,
        display: "grid",
        gap: 10,
      }}
    >
      <div>
        <strong style={{ color: "var(--text)" }}>Esto es un sandbox.</strong> Ningún
        tool toca APIs reales. Los CUITs que ingreses se procesan
        algorítmicamente; los lookups de padrón ARCA, BCRA, IGJ y WSFE
        devuelven datos sintéticos plausibles para que el agente pueda mostrar
        el flujo. Producción real:{" "}
        <a href="/incorporar" style={{ color: "var(--accent)" }}>
          /incorporar
        </a>{" "}
        →{" "}
        <code style={{ fontFamily: FONT_MONO }}>apps/sociedad-ia-starter</code>.
      </div>
      <div>
        <strong style={{ color: "var(--text)" }}>Audit log de esta sesión:</strong>{" "}
        <a
          href={`/dashboard/${sessionId}`}
          target="_blank"
          rel="noreferrer"
          style={{
            color: "var(--accent)",
            fontFamily: FONT_MONO,
            fontSize: 12,
          }}
        >
          /dashboard/{sessionId.slice(0, 8)}…
        </a>
        {", "}timeline forense con cada tool call HMAC-SHA256-firmado server-
        side. JSON crudo en{" "}
        <a
          href={`/api/play/audit/${sessionId}?verify=1`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)", fontFamily: FONT_MONO, fontSize: 12 }}
        >
          /api/play/audit/{sessionId.slice(0, 8)}…?verify=1
        </a>
        .
      </div>
      <div>
        <strong style={{ color: "var(--text)" }}>Auto-incorporación machine-readable:</strong>{" "}
        <code style={{ fontFamily: FONT_MONO, fontSize: 12 }}>
          POST /api/auto-incorporate
        </code>:{" "}
      un agente externo (USA-LLC, ChatGPT, Claude) puede self-incorporar
        una sociedad automatizada argentina en una sola llamada. Ver{" "}
        <a
          href="/api/auto-incorporate"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)" }}
        >
          schema
        </a>
        .
      </div>
      <div>
        <strong style={{ color: "var(--text)" }}>Más:</strong>{" "}
        <a href="/playbook" style={{ color: "var(--accent)" }}>
          /playbook
        </a>{" "}
        ·{" "}
        <a href="/es/playbook" style={{ color: "var(--accent)" }}>
          /es/playbook
        </a>{" "}
        ·{" "}
        <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
          /rfcs/001
        </a>{" "}
        ·{" "}
        <a href="/security" style={{ color: "var(--accent)" }}>
          /security
        </a>{" "}
        ·{" "}
        <a href="/architecture" style={{ color: "var(--accent)" }}>
          /architecture
        </a>
      </div>
    </footer>
  );
}
