"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { describeAgentError, type AgentErrorKind } from "@/lib/ui/agent-error";
import { inferStage, type StageId } from "@/lib/ui/stage";
import { collectToolParts, type MinimalUIMessage } from "@/lib/ui/tool-parts";
import { useLocale } from "@/lib/ui/locale-context";
import type { MessageId } from "@/lib/ui/i18n";
import { ConstitutionCard, type PreviewSocietyOutput } from "@/components/constitution-card";
import type { SocietySummaryLike } from "@/components/operation-dashboard";

const AGENT_ENDPOINT = "/api/agent";

const TOOL_MESSAGE_ID: Record<string, { pending: MessageId; done: MessageId }> = {
  preview_society: { pending: "tool.preview_society.pending", done: "tool.preview_society.done" },
  good_standing: { pending: "tool.good_standing.pending", done: "tool.good_standing.done" },
  my_society: { pending: "tool.my_society.pending", done: "tool.my_society.done" },
};

// Maps describeAgentError's `kind` to the matching localized message id
// (src/lib/ui/agent-error.ts is not editable; its `.message` field is the
// es-only fallback used only if this lookup ever misses).
const AGENT_ERROR_MESSAGE_ID: Record<AgentErrorKind, MessageId> = {
  cap: "agentError.cap",
  no_model_configured: "agentError.no_model_configured",
  provider_no_credit: "agentError.provider_no_credit",
  provider_saturated: "agentError.provider_saturated",
  network: "agentError.network",
  unknown: "agentError.unknown",
};

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
  const { t, format } = useLocale();
  const [input, setInput] = useState("");
  const [constitutingOpen, setConstitutingOpen] = useState(false);

  function toolLabel(name: string, phase: "pending" | "done" | "error"): string {
    if (phase === "error") return format("tool.error", { name });
    const known = TOOL_MESSAGE_ID[name];
    if (known) return t(known[phase]);
    return phase === "pending" ? format("tool.generic.pending", { name }) : format("tool.generic.done", { name });
  }

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
  const agentErrorMessage = agentError
    ? t(AGENT_ERROR_MESSAGE_ID[agentError.kind]) || agentError.message
    : null;

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
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{t("chat.empty")}</p>
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
              {message.role === "user" ? t("role.user") : t("role.agent")}
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
                        label={t("chat.preview.replaced")}
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

        {status === "submitted" ? <StatusLine kind="pending" label={t("chat.thinking")} /> : null}

        {agentError ? (
          <div
            className="card"
            style={{
              borderColor: agentError.kind === "cap" ? "#b91c1c" : "var(--border-color)",
              fontSize: 13,
            }}
          >
            {agentErrorMessage}
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
          placeholder={t("chat.input.placeholder")}
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
          {t("action.send")}
        </button>
      </form>
    </div>
  );
}
