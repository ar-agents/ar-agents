"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Post-checkout landing for El Auditor. Mercado Pago redirects here with
 * ?preapproval_id= after the payer authorizes the subscription; this
 * component exchanges it for the API key via POST /api/auditor/activate.
 * Idempotent server-side: refreshing the page returns the same key.
 */

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type State =
  | { phase: "loading" }
  | { phase: "no-id" }
  | { phase: "pending"; note: string }
  | { phase: "error"; note: string }
  | {
      phase: "active";
      apiKey: string;
      sessionId: string;
      dashboardUrl: string;
      verifyUrl: string;
    };

export function ActivateClient() {
  const params = useSearchParams();
  const preapprovalId = params.get("preapproval_id")?.trim() || "";
  const [state, setState] = useState<State>({ phase: "loading" });
  const [copied, setCopied] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!preapprovalId) {
      setState({ phase: "no-id" });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // MP can lag flipping the preapproval to "authorized" after the redirect.
    // Auto-retry with backoff so a paid customer isn't dead-ended on "pending";
    // the activate endpoint is idempotent, so retries are safe.
    const DELAYS = [3000, 5000, 8000, 13000, 20000];

    const attempt = async (n: number) => {
      try {
        const r = await fetch("/api/auditor/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preapprovalId }),
        });
        const j = await r.json();
        if (cancelled) return;
        if (j?.ok && j.apiKey) {
          setState({
            phase: "active",
            apiKey: j.apiKey,
            sessionId: j.audit?.sessionId ?? "",
            dashboardUrl: j.audit?.dashboardUrl ?? "",
            verifyUrl: j.audit?.verifyUrl ?? "",
          });
          return;
        }
        if (j?.error === "not_authorized_yet") {
          setState({ phase: "pending", note: j.note ?? "" });
          if (n < DELAYS.length) {
            timer = setTimeout(() => void attempt(n + 1), DELAYS[n]);
          }
          return;
        }
        setState({ phase: "error", note: j?.note || j?.message || j?.error || "unknown" });
      } catch {
        if (!cancelled) setState({ phase: "error", note: "network" });
      }
    };

    void attempt(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [preapprovalId, retryNonce]);

  const box: CSSProperties = {
    fontFamily: FONT_SANS,
    fontSize: 15,
    color: "var(--text-body)",
    lineHeight: 1.65,
  };

  if (state.phase === "loading") {
    return <p style={box}>Verificando tu suscripción con Mercado Pago…</p>;
  }
  if (state.phase === "no-id") {
    return (
      <p style={box}>
        Falta el parámetro <code style={{ fontFamily: FONT_MONO }}>preapproval_id</code>. Si venís
        del checkout de Mercado Pago, el link debería incluirlo. Si te suscribiste por API, llamá a{" "}
        <code style={{ fontFamily: FONT_MONO }}>POST /api/auditor/activate</code> con el id.
      </p>
    );
  }
  if (state.phase === "pending") {
    return (
      <div style={box}>
        <p style={{ margin: "0 0 12px" }}>
          Tu suscripción todavía figura <strong>pendiente</strong> en Mercado Pago. {state.note}{" "}
          Estamos reintentando solos cada pocos segundos; en cuanto la autorices, tu API key aparece acá.
        </p>
        <button
          onClick={() => setRetryNonce((n) => n + 1)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "var(--bg)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Reintentar ahora
        </button>
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <p style={box}>
        No pudimos activar la suscripción ({state.note}). Escribinos a{" "}
        <a href="mailto:naza@naza.ar" style={{ color: "var(--accent)" }}>
          naza@naza.ar
        </a>{" "}
        con tu preapproval_id y lo resolvemos.
      </p>
    );
  }

  const curl = `curl -X POST https://ar-agents.ar/api/auditor/log \\
  -H "x-api-key: ${state.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"tool":"primera_decision","input":{"hola":"mundo"}}'`;

  return (
    <div style={box}>
      <p style={{ margin: "0 0 14px" }}>
        ✓ <strong>El Auditor está activo.</strong> Esta es tu API key, guardala (recargar esta
        página con el mismo preapproval_id la vuelve a mostrar, pero tratala como un secreto):
      </p>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          margin: "0 0 18px",
        }}
      >
        <code
          style={{
            fontFamily: FONT_MONO,
            fontSize: 13,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--bg-tint)",
            wordBreak: "break-all",
          }}
        >
          {state.apiKey}
        </code>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(state.apiKey).then(() => setCopied(true));
          }}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--accent)",
            background: copied ? "transparent" : "var(--accent)",
            color: copied ? "var(--accent)" : "var(--bg)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {copied ? "Copiada ✓" : "Copiar"}
        </button>
      </div>
      <p style={{ margin: "0 0 8px" }}>Tu primer registro firmado, en una línea:</p>
      <pre
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12.5,
          padding: "12px 14px",
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          background: "var(--bg-tint)",
          overflowX: "auto",
          margin: "0 0 18px",
        }}
      >
        {curl}
      </pre>
      <p style={{ margin: 0 }}>
        Tu sesión durable y públicamente verificable:{" "}
        <a href={state.dashboardUrl} style={{ color: "var(--accent)" }}>
          dashboard
        </a>{" "}
        ·{" "}
        <a href={state.verifyUrl} style={{ color: "var(--accent)" }}>
          verificación criptográfica
        </a>
        . Cada entrada queda firmada HMAC-SHA256 + Ed25519, la prueba del procedimiento de
        decisión adecuado (arts. 101/102 del anteproyecto).
      </p>
    </div>
  );
}
