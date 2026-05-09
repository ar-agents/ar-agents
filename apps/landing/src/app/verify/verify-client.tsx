"use client";

/**
 * /verify — paste-a-session-id UI for independent verification.
 *
 * Hits /api/play/audit/{id}?verify=1 and renders the server's report
 * (count, verified, tampered, hmacWired). The point is to give an
 * external party a clean, decisive "is this audit log clean?" answer
 * without them having to know how curl works.
 */

import { useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";
const SHADOW_CARD =
  "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px";

type AuditEntry = {
  id: string;
  ts: string;
  tool: string;
  governance: string;
  hmac: string | null;
};

interface VerifyResponse {
  sessionId: string;
  backend: "vercel-kv" | "in-memory";
  count: number;
  entries: AuditEntry[];
  verification?: {
    total: number;
    verified: number;
    tampered: number;
    hmacWired: boolean;
  };
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function isValid(s: string): boolean {
  return SESSION_ID_RE.test(s);
}

export function VerifyClient() {
  const [sessionId, setSessionId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResponse | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const trimmed = sessionId.trim();
    if (!isValid(trimmed)) {
      setError(
        "Session ID inválido. Debe ser 8-64 caracteres alfanuméricos (UUIDs y tokens permitidos).",
      );
      return;
    }
    setError(null);
    setPending(true);
    setResult(null);
    try {
      const r = await fetch(
        `/api/play/audit/${encodeURIComponent(trimmed)}?verify=1`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? r.statusText);
        return;
      }
      const j = (await r.json()) as VerifyResponse;
      setResult(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ maxWidth: 840, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <p
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: 0,
          }}
        >
          /arg · verify · independent forensic check
        </p>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: "-1.8px",
            lineHeight: 1.05,
            margin: "6px 0 8px",
          }}
        >
          Verificá un audit log
        </h1>
        <p style={{ fontSize: 14, color: "#4d4d4d", lineHeight: 1.55, margin: 0 }}>
          Pegá el ID de una sesión de{" "}
          <a href="/play" style={{ color: "#0072f5" }}>
            /play
          </a>{" "}
          o{" "}
          <code style={{ fontFamily: FONT_MONO }}>/api/auto-incorporate</code>{" "}
          y el servidor recomputa el HMAC-SHA256 de cada entrada contra el
          secret <em>server-side</em>. Si <code>tampered &gt; 0</code>, la
          firma no coincide con el cuerpo y alguien modificó la entrada
          después de la escritura. RFC-001 § 9.2.
        </p>
      </header>

      <form
        onSubmit={submit}
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          background: "#fff",
          padding: 14,
          borderRadius: 8,
          boxShadow: SHADOW_CARD,
        }}
      >
        <label htmlFor="session-input" style={visuallyHidden}>
          Session ID
        </label>
        <input
          id="session-input"
          name="sessionId"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="e.g. 4f50ebf2-94ec-4c75-b94a-6e8e1f54f5bc"
          autoFocus
          autoComplete="off"
          maxLength={64}
          aria-describedby="session-hint"
          style={{
            flex: 1,
            minWidth: 240,
            background: "#fff",
            color: "#171717",
            border: 0,
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 14,
            fontFamily: FONT_MONO,
            boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
            outline: "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow =
              "hsla(212, 100%, 48%, 1) 0px 0px 0px 2px";
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow =
              "rgb(235,235,235) 0px 0px 0px 1px";
          }}
        />
        <span id="session-hint" style={visuallyHidden}>
          Session IDs are 8-64 alphanumeric characters. UUIDs are valid.
        </span>
        <button
          type="submit"
          disabled={pending || !sessionId.trim()}
          aria-busy={pending}
          style={{
            background:
              pending || !sessionId.trim() ? "#ebebeb" : "#171717",
            color: pending || !sessionId.trim() ? "#666" : "#fff",
            border: 0,
            borderRadius: 6,
            padding: "10px 18px",
            fontSize: 14,
            fontFamily: "inherit",
            fontWeight: 500,
            cursor: pending || !sessionId.trim() ? "not-allowed" : "pointer",
          }}
        >
          {pending ? "verificando…" : "Verificar →"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 14,
            background: "#fff5f5",
            color: "#c53030",
            padding: "12px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: FONT_MONO,
            boxShadow: "rgba(197,48,48,0.2) 0px 0px 0px 1px",
          }}
        >
          {error}
        </div>
      )}

      {result && <ResultPanel result={result} />}

      <Footer />
    </div>
  );
}

function ResultPanel({ result }: { result: VerifyResponse }) {
  const v = result.verification;
  if (!v) return null;

  let title: string;
  let detail: string;
  let bg: string;
  let color: string;
  if (!v.hmacWired) {
    title = "AUDIT_HMAC_SECRET no configurado";
    detail =
      "El servidor no tiene el secret server-side; las entradas no fueron firmadas. La verificación queda sin contenido.";
    bg = "#f5f5f5";
    color = "#666";
  } else if (v.tampered > 0) {
    title = `${v.tampered} entrada${v.tampered === 1 ? "" : "s"} con tampering detectado`;
    detail =
      "La firma HMAC-SHA256 de al menos una entrada no coincide con su cuerpo público. Alguien modificó la entrada después de la firma.";
    bg = "#fff1f0";
    color = "#ff5b4f";
  } else if (v.total === 0) {
    title = "Sin entradas en esta sesión";
    detail =
      "El session id es válido pero no hay tool calls registrados. Puede ser una sesión nueva, expirada (TTL 7 días en KV), o un id que no se usó.";
    bg = "#fafafa";
    color = "#666";
  } else {
    title = `${v.verified} de ${v.total} entradas verificadas · log limpio`;
    detail =
      "Cada entrada tiene HMAC-SHA256 firmado al momento de la escritura. La firma se recomputa contra el cuerpo canonical-JSON-serializado y coincide.";
    bg = "#ebf5ff";
    color = "#0a72ef";
  }

  return (
    <section
      style={{
        marginTop: 24,
        background: bg,
        padding: 18,
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.88px",
          color,
          lineHeight: 1.2,
        }}
      >
        {title}
      </div>
      <p style={{ margin: "8px 0 16px", fontSize: 14, color: "#4d4d4d", lineHeight: 1.55 }}>
        {detail}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Metric label="entradas" value={String(v.total)} />
        <Metric
          label="verificadas"
          value={v.hmacWired ? `${v.verified}/${v.total}` : "—"}
        />
        <Metric
          label="tampered"
          value={v.hmacWired ? String(v.tampered) : "—"}
          tone={v.tampered > 0 ? "danger" : undefined}
        />
        <Metric
          label="backend"
          value={result.backend}
          tone={result.backend === "vercel-kv" ? "ok" : "muted"}
        />
        <Metric
          label="hmac"
          value={v.hmacWired ? "wired" : "missing"}
          tone={v.hmacWired ? "ok" : "muted"}
        />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, fontFamily: FONT_MONO }}>
        <a
          href={`/dashboard/${result.sessionId}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "#0072f5" }}
        >
          /dashboard/{result.sessionId.slice(0, 8)}…
        </a>
        <a
          href={`/api/play/audit/${result.sessionId}?verify=1`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "#0072f5" }}
        >
          /api/play/audit/{result.sessionId.slice(0, 8)}…?verify=1
        </a>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger" | "muted" | "neutral";
}) {
  const color =
    tone === "ok"
      ? "#0a72ef"
      : tone === "danger"
        ? "#ff5b4f"
        : tone === "muted"
          ? "#666"
          : "#171717";
  return (
    <div
      style={{
        background: "#fff",
        padding: "10px 12px",
        borderRadius: 6,
        boxShadow: SHADOW_BORDER,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: FONT_MONO,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color,
          fontFamily: FONT_MONO,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer
      style={{
        marginTop: 32,
        padding: 16,
        background: "#fafafa",
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
        fontSize: 13,
        color: "#4d4d4d",
        lineHeight: 1.6,
      }}
    >
      <strong style={{ color: "#171717" }}>Cómo verificar manualmente:</strong>{" "}
      <code style={{ fontFamily: FONT_MONO, fontSize: 12 }}>
        curl https://ar-agents.vercel.app/api/play/audit/&#123;sessionId&#125;?verify=1
      </code>{" "}
      devuelve el JSON crudo. Cada entrada incluye{" "}
      <code style={{ fontFamily: FONT_MONO, fontSize: 12 }}>hmac</code>{" "}
      (SHA-256 sobre canonical-JSON de los demás campos). Querés validar con
      tu propio toolkit? Recomputá HMAC-SHA256 con el secret server-side y
      comparalo. RFC-001 § 9.2 cubre el contrato de probatoriedad legal.
    </footer>
  );
}

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
