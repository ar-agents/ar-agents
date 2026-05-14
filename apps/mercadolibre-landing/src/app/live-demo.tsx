"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import { useLang } from "./i18n";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const PRESET_PROMPTS_EN = [
  "How many paid orders do I have today and is there anything to ship?",
  "List my unanswered questions and flag any that look like spam.",
  "Show me my open claims sorted by SLA, flag any due in <24h.",
  "Categorize a new listing for 'Yerba Mate Amanda Tradicional 1kg' and tell me the required attributes.",
  "What promotions can I apply today?",
  "How is my seller reputation? Critical alerts first.",
];

const PRESET_PROMPTS_ES = [
  "¿Cuántas órdenes pagas tengo hoy y hay algo para despachar?",
  "Listame las preguntas sin responder y marcame las que parezcan spam.",
  "Mostrame los claims abiertos ordenados por SLA, marcame los que vencen en <24h.",
  "Categorizá un listado nuevo para 'Yerba Mate Amanda Tradicional 1kg' y decime los atributos obligatorios.",
  "¿Qué promociones puedo aplicar hoy?",
  "¿Cómo está mi reputación de vendedor? Alertas críticas primero.",
];

export function LiveDemo() {
  const { lang } = useLang();
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/demo" }),
  });

  const presets = lang === "es" ? PRESET_PROMPTS_ES : PRESET_PROMPTS_EN;
  const isStreaming = status === "streaming" || status === "submitted";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage({ text: input });
    setInput("");
  };

  const onPresetClick = (preset: string) => {
    if (isStreaming) return;
    sendMessage({ text: preset });
  };

  return (
    <div
      style={{
        background: "var(--bg-tint)",
        borderRadius: 12,
        boxShadow: "var(--shadow-border)",
        padding: 0,
        overflow: "hidden",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent-strong)",
            boxShadow: "0 0 6px var(--accent-strong)",
          }}
        />
        {lang === "es"
          ? "claude-sonnet-4-6 · seller 12345 (MLA) · backend mockeado"
          : "claude-sonnet-4-6 · seller 12345 (MLA) · mocked backend"}
      </div>

      {/* MESSAGES */}
      <div
        style={{
          minHeight: 200,
          maxHeight: 480,
          overflowY: "auto",
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            {lang === "es"
              ? "Probá una pregunta de abajo, o escribí la tuya."
              : "Try a preset below, or type your own."}
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {isStreaming && (
          <div
            style={{
              fontSize: 12,
              fontFamily: FONT_MONO,
              color: "var(--text-muted)",
            }}
          >
            ●●● {lang === "es" ? "pensando…" : "thinking…"}
          </div>
        )}
      </div>

      {/* PRESETS */}
      <div
        style={{
          padding: "10px 18px",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            disabled={isStreaming}
            onClick={() => onPresetClick(p)}
            style={{
              fontSize: 11,
              fontFamily: FONT_MONO,
              padding: "5px 9px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg)",
              color: "var(--text-body)",
              cursor: isStreaming ? "default" : "pointer",
              opacity: isStreaming ? 0.5 : 1,
            }}
          >
            {p.length > 60 ? p.slice(0, 58) + "…" : p}
          </button>
        ))}
      </div>

      {/* INPUT */}
      <form
        onSubmit={onSubmit}
        style={{
          padding: "10px 14px 14px",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isStreaming}
          placeholder={
            lang === "es"
              ? "Decile algo al agente…"
              : "Ask the agent…"
          }
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent-strong)",
            color: "var(--accent-strong-text)",
            fontSize: 13,
            fontFamily: FONT_MONO,
            fontWeight: 600,
            letterSpacing: "0.02em",
            cursor: isStreaming || !input.trim() ? "default" : "pointer",
            opacity: isStreaming || !input.trim() ? 0.5 : 1,
          }}
        >
          {lang === "es" ? "Enviar" : "Send"}
        </button>
      </form>
    </div>
  );
}

type UIMessageLike = {
  id: string;
  role: "user" | "assistant" | "system";
  parts?: Array<
    | { type: "text"; text: string }
    | { type: `tool-${string}`; toolCallId?: string; state?: string; input?: unknown; output?: unknown }
    | { type: string; text?: string }
  >;
};

function Message({ message }: { message: UIMessageLike }) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
        }}
      >
        {isUser ? "you" : "agent"}
      </div>
      <div
        style={{
          maxWidth: "85%",
          padding: "10px 14px",
          borderRadius: 10,
          background: isUser ? "var(--accent-bg)" : "var(--bg)",
          color: isUser ? "var(--text)" : "var(--text)",
          boxShadow: isUser ? "none" : "var(--shadow-border)",
          whiteSpace: "pre-wrap",
        }}
      >
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            return <span key={i}>{part.text}</span>;
          }
          if (part.type.startsWith("tool-")) {
            const toolName = part.type.slice(5);
            const callPart = part as {
              type: string;
              state?: string;
              input?: unknown;
              output?: unknown;
            };
            return (
              <div
                key={i}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  background: "var(--bg-tint)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  margin: "6px 0",
                  borderLeft: "3px solid var(--accent-strong)",
                }}
              >
                <div style={{ fontWeight: 600, color: "var(--accent-text)" }}>
                  → {toolName}
                </div>
                {callPart.input !== undefined && (
                  <div
                    style={{
                      marginTop: 4,
                      color: "var(--text-muted)",
                      fontSize: 10,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(callPart.input, null, 2)}
                  </div>
                )}
                {callPart.state === "output-available" &&
                  callPart.output !== undefined && (
                    <details style={{ marginTop: 6 }}>
                      <summary
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        result ({truncate(JSON.stringify(callPart.output), 40)})
                      </summary>
                      <pre
                        style={{
                          marginTop: 4,
                          color: "var(--text-body)",
                          fontSize: 10,
                          maxHeight: 200,
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {JSON.stringify(callPart.output, null, 2)}
                      </pre>
                    </details>
                  )}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
