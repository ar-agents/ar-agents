"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { describeAgentError } from "@/lib/ui/agent-error";
import { inferStage, type StageId } from "@/lib/ui/stage";
import { collectToolParts, type MinimalUIMessage } from "@/lib/ui/tool-parts";
import { ConstitutionCard, type PreviewSocietyOutput } from "@/components/constitution-card";
import type { SocietySummaryLike } from "@/components/operation-dashboard";

const AGENT_ENDPOINT = "/api/agent";

const TOOL_LABELS: Record<string, { pending: string; done: string }> = {
  preview_society: {
    pending: "armando el borrador de la sociedad...",
    done: "borrador listo",
  },
  good_standing: {
    pending: "consultando el certificador...",
    done: "estado del registro consultado",
  },
  my_society: {
    pending: "revisando tu sociedad...",
    done: "sociedad revisada",
  },
};

function toolLabel(name: string, phase: "pending" | "done" | "error"): string {
  if (phase === "error") return `${name}: no se pudo completar`;
  const known = TOOL_LABELS[name];
  if (known) return known[phase];
  return phase === "pending" ? `ejecutando ${name}...` : `${name} listo`;
}

function StatusLine({ label, kind }: { label: string; kind: "pending" | "done" | "error" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: kind === "error" ? "#b91c1c" : "var(--text-muted)",
        margin: "4px 0",
      }}
    >
      <span
        className={`status-dot${kind === "pending" ? " status-dot-pending" : ""}`}
        style={{ background: kind === "error" ? "#b91c1c" : "var(--accent)" }}
      />
      {label}
    </div>
  );
}

export function Chat({
  token,
  hasSociety,
  onStageChange,
  onSocietyCreated,
}: {
  token: string;
  hasSociety: boolean;
  onStageChange?: (stage: StageId) => void;
  onSocietyCreated?: (society: SocietySummaryLike) => void;
}) {
  const [input, setInput] = useState("");
  const [constitutingOpen, setConstitutingOpen] = useState(false);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: AGENT_ENDPOINT, headers: { "x-studio-token": token } }),
    [token],
  );

  const { messages, sendMessage, status, error, clearError } = useChat({ transport });

  const minimalMessages = messages as unknown as MinimalUIMessage[];

  const previewMatches = collectToolParts(minimalMessages).filter(
    (m) => m.name === "preview_society" && m.part.state === "output-available",
  );
  const latestPreviewPart = previewMatches.length > 0 ? previewMatches[previewMatches.length - 1].part : null;
  const hasPreviewDraft = latestPreviewPart !== null;

  const stage: StageId = inferStage({
    hasSociety,
    hasPreviewDraft,
    constituting: constitutingOpen,
    messageCount: messages.length,
  });

  useEffect(() => {
    onStageChange?.(stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const busy = status === "submitted" || status === "streaming";
  const agentError = describeAgentError(error);

  function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    clearError();
    void sendMessage({ text }, { body: { stage } });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        border: "1px solid var(--border-color)",
        borderRadius: 10,
        background: "var(--bg-tint)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "18px 20px",
          minHeight: 260,
          maxHeight: 520,
          overflowY: "auto",
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Contame qué querés armar y empezamos.
          </p>
        ) : null}

        {messages.map((message) => (
          <div key={message.id}>
            <span
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-muted)",
              }}
            >
              {message.role === "user" ? "vos" : "agente"}
            </span>
            <div style={{ marginTop: 2 }}>
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <p key={i} style={{ margin: "0 0 4px", whiteSpace: "pre-wrap" }}>
                      {part.text}
                    </p>
                  );
                }

                const name =
                  part.type === "dynamic-tool"
                    ? part.toolName
                    : part.type.startsWith("tool-")
                      ? part.type.slice("tool-".length)
                      : null;
                if (!name) return null;

                const state = "state" in part ? part.state : undefined;
                if (state === "output-error" || state === "output-denied") {
                  return <StatusLine key={i} kind="error" label={toolLabel(name, "error")} />;
                }
                if (state === "output-available") {
                  if (name === "preview_society" && part === latestPreviewPart) {
                    return (
                      <ConstitutionCard
                        key={i}
                        token={token}
                        output={("output" in part ? part.output : undefined) as PreviewSocietyOutput}
                        disabled={hasSociety}
                        open={constitutingOpen}
                        onOpenChange={setConstitutingOpen}
                        onConstituted={(result) => {
                          setConstitutingOpen(false);
                          if (result.society) {
                            onSocietyCreated?.(result.society as SocietySummaryLike);
                          }
                        }}
                      />
                    );
                  }
                  if (name === "preview_society") {
                    return (
                      <StatusLine
                        key={i}
                        kind="done"
                        label="borrador anterior (reemplazado por uno más nuevo)"
                      />
                    );
                  }
                  return <StatusLine key={i} kind="done" label={toolLabel(name, "done")} />;
                }
                // input-streaming / input-available / approval-* -> still pending
                return <StatusLine key={i} kind="pending" label={toolLabel(name, "pending")} />;
              })}
            </div>
          </div>
        ))}

        {status === "submitted" ? <StatusLine kind="pending" label="pensando..." /> : null}

        {agentError ? (
          <div
            className="card"
            style={{
              borderColor: agentError.kind === "cap" ? "#b91c1c" : "var(--border-color)",
              fontSize: 13,
            }}
          >
            {agentError.message}
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{
          display: "flex",
          gap: 8,
          padding: 12,
          borderTop: "1px solid var(--border-color)",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ej: quiero automatizar la facturación de mi kiosco"
          disabled={busy}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid var(--border-color)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            padding: "10px 16px",
            borderRadius: 6,
            border: "none",
            background: "var(--primary-bg)",
            color: "var(--primary-text)",
            fontSize: 14,
            fontWeight: 500,
            cursor: busy || !input.trim() ? "default" : "pointer",
            opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
