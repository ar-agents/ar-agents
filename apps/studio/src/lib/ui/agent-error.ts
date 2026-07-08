// Maps whatever POST /api/agent failed with into es-AR copy the chat UI can
// show. @ai-sdk/react's useChat surfaces a non-2xx response as a thrown Error
// whose `.message` is the raw response body TEXT (see HttpChatTransport in
// node_modules/ai: `throw new Error(await response.text())` when
// `!response.ok`, no status code attached). Studio's /api/agent always
// answers a non-2xx with `{ ok: false, error: string }` JSON
// (docs/CONTRACT.md), so parsing that message as JSON recovers the error
// code without needing the HTTP status. A genuine network failure (fetch
// itself throwing, e.g. offline) yields a non-JSON message instead. Pure,
// so the mapping is unit-testable without mocking useChat.

export type AgentErrorKind =
  | "cap"
  | "no_model_configured"
  | "provider_no_credit"
  | "provider_saturated"
  | "network"
  | "unknown";

export interface AgentErrorInfo {
  kind: AgentErrorKind;
  /** es-AR copy ready to render. */
  message: string;
}

export const CAP_MESSAGE =
  "Llegaste al límite gratuito de este mes. Un cap es un tope de gasto en modelos para que la demo no te salga cara a vos ni a nosotros. El mes que viene se resetea.";

export const NO_MODEL_MESSAGE =
  "Todavía no hay un modelo de lenguaje configurado en este entorno. Definí OPENROUTER_API_KEY o AI_GATEWAY_API_KEY (ver .env.example) para activar el agente.";

export const NETWORK_MESSAGE =
  "No se pudo hablar con el agente (falla de red). Probá de nuevo en un rato.";

export const UNKNOWN_MESSAGE = "Algo salió mal hablando con el agente. Probá de nuevo en un rato.";

export const PROVIDER_NO_CREDIT_MESSAGE =
  "El proveedor de modelos rechazó el pedido por falta de crédito. Es un problema de configuración nuestro, no tuyo.";

export const PROVIDER_SATURATED_MESSAGE =
  "El modelo está saturado en este momento. Esperá unos segundos y probá de nuevo.";

/** Returns null when there is no error to show. */
export function describeAgentError(error: unknown): AgentErrorInfo | null {
  if (!error) return null;
  const raw = error instanceof Error ? error.message : String(error);
  if (!raw) return { kind: "network", message: NETWORK_MESSAGE };

  // Mid-stream failures arrive as bare error codes from the stream's onError
  // mapping (see /api/agent), not as JSON bodies.
  if (raw === "proveedor_sin_credito") {
    return { kind: "provider_no_credit", message: PROVIDER_NO_CREDIT_MESSAGE };
  }
  if (raw === "proveedor_saturado") {
    return { kind: "provider_saturated", message: PROVIDER_SATURATED_MESSAGE };
  }
  if (raw === "agent_failed") {
    return { kind: "unknown", message: UNKNOWN_MESSAGE };
  }

  try {
    const parsed = JSON.parse(raw) as { ok?: boolean; error?: string } | null;
    if (parsed && parsed.ok === false && typeof parsed.error === "string") {
      if (parsed.error === "cap") return { kind: "cap", message: CAP_MESSAGE };
      if (parsed.error === "no_model_configured") {
        return { kind: "no_model_configured", message: NO_MODEL_MESSAGE };
      }
      return { kind: "unknown", message: UNKNOWN_MESSAGE };
    }
  } catch {
    // Not JSON: a network-level failure (fetch threw) or an unexpected
    // non-JSON error body. Either way, treat it as a network problem.
  }
  return { kind: "network", message: NETWORK_MESSAGE };
}
