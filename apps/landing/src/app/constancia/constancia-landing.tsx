"use client";

/**
 * /constancia, the Constancia Oracle landing + free lookup widget.
 *
 * Headline promise: verify any CUIT's constancia, signed. The free tier is the
 * instant mod-11 check-digit verdict; the badge + proof page are the shareable
 * surfaces that propagate the loop. Good-standing (ARCA) is honestly labeled
 * premium until a fetcher is wired.
 *
 * AR Spanish (vos), Geist + CSS-var theme to match the rest of the site.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

interface LookupResult {
  cuit: string;
  valid: boolean;
  formatted: string;
  personType: string;
  validationError: string | null;
  verdictAvailable: boolean;
  goodStanding: { denominacion?: string; condicion?: string } | null;
  reason: string | null;
  proofUrl: string;
  badgeUrl: string;
  attestation?: {
    signature: { keyId: string };
    body: { statement: string };
  } | null;
}

const EXAMPLE_CUIT = "20-12345678-6";

export function ConstanciaLanding() {
  const [cuit, setCuit] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/constancia/lookup?cuit=${encodeURIComponent(trimmed)}`,
        { headers: { accept: "application/json" } },
      );
      const json = (await res.json()) as
        | { ok: true; result: LookupResult }
        | { error: string; note?: string };
      if ("ok" in json && json.ok) {
        setResult(json.result);
      } else {
        setError(
          ("note" in json && json.note) ||
            "No pudimos consultar el CUIT. Probá de nuevo.",
        );
      }
    } catch {
      setError("Error de red. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "56px 24px 110px" }}>
      {/* HERO */}
      <p style={eyebrow}>Constancia Oracle · ar-agents</p>
      <h1
        style={{
          fontSize: "clamp(32px, 6.4vw, 60px)",
          fontWeight: 450,
          lineHeight: 1.03,
          letterSpacing: "-0.06em",
          margin: "14px 0 0",
        }}
      >
        Verificá la constancia
        <br />
        de cualquier CUIT. Firmada.
      </h1>
      <p
        style={{
          margin: "20px 0 0",
          fontSize: "clamp(16px, 2.4vw, 19px)",
          color: "var(--text-body)",
          lineHeight: 1.55,
          maxWidth: 560,
        }}
      >
        Validá el dígito verificador al instante, gratis, y llevate un badge
        &quot;Verificado por ar-agents&quot; para embeber donde afirmes ese
        CUIT. La buena situación fiscal real de ARCA es la capa premium.
      </p>

      {/* LOOKUP WIDGET */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(cuit);
        }}
        style={{ marginTop: 32 }}
      >
        <label htmlFor="cuit-input" style={fieldLabel}>
          Ingresá un CUIT
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id="cuit-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder={EXAMPLE_CUIT}
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            style={{
              flex: "1 1 260px",
              minWidth: 0,
              fontFamily: FONT_MONO,
              fontSize: 18,
              padding: "13px 15px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--bg-tint)",
              color: "var(--text)",
            }}
          />
          <button
            type="submit"
            disabled={loading || !cuit.trim()}
            style={{
              flex: "0 0 auto",
              fontSize: 16,
              fontWeight: 600,
              padding: "13px 22px",
              borderRadius: 10,
              border: "none",
              background: "var(--primary-bg)",
              color: "var(--primary-text)",
              cursor: loading || !cuit.trim() ? "not-allowed" : "pointer",
              opacity: loading || !cuit.trim() ? 0.6 : 1,
            }}
          >
            {loading ? "Verificando…" : "Verificar"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setCuit(EXAMPLE_CUIT);
            lookup(EXAMPLE_CUIT);
          }}
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "var(--accent)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: FONT_MONO,
          }}
        >
          probar con {EXAMPLE_CUIT}
        </button>
      </form>

      {error ? (
        <p
          role="alert"
          style={{
            marginTop: 18,
            fontSize: 14,
            color: "var(--danger)",
          }}
        >
          {error}
        </p>
      ) : null}

      {result ? <ResultCard result={result} /> : null}

      {/* HOW IT WORKS */}
      <section style={{ marginTop: 64 }}>
        <h2 style={sectionTitle}>Cómo funciona</h2>
        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <Step
            n="01"
            t="Validación instantánea"
            d="Calculamos el dígito verificador (módulo 11) en el browser y el servidor. Sin clave fiscal, sin esperar a ningún padrón. Gratis, siempre."
          />
          <Step
            n="02"
            t="Badge para embeber"
            d="Cada CUIT tiene una página de prueba pública y un badge SVG que se actualiza solo. Pegalo en un README, perfil o alta de proveedor."
          />
          <Step
            n="03"
            t="Buena situación fiscal (premium)"
            d="La constancia oficial de ARCA, con denominación, régimen e impuestos, es la capa premium. Honesta: si no está configurada, lo decimos, no inventamos un verdicto."
          />
        </div>
      </section>

      {/* EMAIL CAPTURE */}
      <EmailCapture />

      <p
        style={{
          marginTop: 40,
          fontSize: 13,
          color: "var(--text-muted)",
          lineHeight: 1.6,
        }}
      >
        Parte de{" "}
        <Link href="/" style={{ color: "var(--accent)" }}>
          ar-agents
        </Link>
        , infraestructura abierta para sociedades automatizadas en Argentina.
      </p>
    </div>
  );
}

function ResultCard({ result }: { result: LookupResult }) {
  const valid = result.valid;
  return (
    <section
      style={{
        marginTop: 26,
        border: "1px solid var(--border-color)",
        borderRadius: 14,
        padding: 22,
        background: "var(--bg-tint)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 10,
            fontSize: 18,
            background: valid ? "var(--success-bg)" : "var(--danger-bg)",
            color: valid ? "var(--success)" : "var(--danger)",
          }}
        >
          {valid ? "✓" : "✕"}
        </span>
        <div>
          <strong style={{ fontSize: 18 }}>
            {valid ? "CUIT válido" : "CUIT no válido"}
          </strong>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 15,
              color: "var(--text-body)",
            }}
          >
            {result.formatted}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.badgeUrl}
          alt={`constancia: ${valid ? "válida" : "no válida"}`}
          height={20}
          style={{ marginLeft: "auto", display: "block" }}
        />
      </div>

      {!valid && result.validationError ? (
        <p style={{ marginTop: 12, fontSize: 14, color: "var(--text-muted)" }}>
          {result.validationError}
        </p>
      ) : null}

      {/* Good-standing premium state */}
      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          borderRadius: 10,
          background: "var(--bg)",
          border: "1px solid var(--border-light)",
          fontSize: 14,
          color: "var(--text-body)",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        {result.verdictAvailable && result.goodStanding ? (
          <span style={{ color: "var(--success)" }}>
            {result.goodStanding.denominacion} · {result.goodStanding.condicion}
          </span>
        ) : (
          <>
            <span
              style={{
                fontSize: 11,
                fontFamily: FONT_MONO,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--warning-bg)",
                color: "var(--warning)",
                flex: "0 0 auto",
              }}
            >
              premium
            </span>
            <span>{result.reason}</span>
          </>
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={result.proofUrl.replace("https://ar-agents.ar", "")}
          style={ctaPrimary}
        >
          Ver página de prueba
        </Link>
        <Link
          href={result.proofUrl.replace("https://ar-agents.ar", "")}
          style={ctaGhost}
        >
          Copiar el badge →
        </Link>
      </div>

      {result.attestation ? (
        <p
          style={{
            marginTop: 14,
            fontSize: 12,
            fontFamily: FONT_MONO,
            color: "var(--text-muted)",
          }}
        >
          Resultado firmado · Ed25519 · {result.attestation.signature.keyId}.
          Verificable en la página de prueba.
        </p>
      ) : null}
    </section>
  );
}

function EmailCapture() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const valid = useMemo(() => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()), [
    email,
  ]);
  return (
    <section
      style={{
        marginTop: 56,
        border: "1px solid var(--border-color)",
        borderRadius: 14,
        padding: 22,
      }}
    >
      <h2 style={{ ...sectionTitle, marginTop: 0 }}>Novedades del Oracle</h2>
      <p
        style={{
          margin: "6px 0 14px",
          fontSize: 14,
          color: "var(--text-body)",
          lineHeight: 1.55,
        }}
      >
        Cuando se prenda la buena situación fiscal real de ARCA, te avisamos.
      </p>
      {sent ? (
        <p style={{ fontSize: 14, color: "var(--success)" }}>
          Listo. Te escribimos a {email.trim()}.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            // Lightweight capture: persist locally for now; the backend
            // waitlist endpoint can read these once it exists. No PII leaves
            // the browser yet, so this never blocks on a missing service.
            try {
              const key = "constancia-waitlist";
              const prev = JSON.parse(
                localStorage.getItem(key) ?? "[]",
              ) as string[];
              if (!prev.includes(email.trim())) prev.push(email.trim());
              localStorage.setItem(key, JSON.stringify(prev));
            } catch {
              // storage blocked, still show success (best-effort capture)
            }
            setSent(true);
          }}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <input
            type="email"
            placeholder="tu@mail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Tu email"
            style={{
              flex: "1 1 240px",
              minWidth: 0,
              fontSize: 15,
              padding: "11px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--bg-tint)",
              color: "var(--text)",
            }}
          />
          <button
            type="submit"
            disabled={!valid}
            style={{
              flex: "0 0 auto",
              fontSize: 15,
              fontWeight: 600,
              padding: "11px 18px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--bg)",
              color: "var(--text)",
              cursor: valid ? "pointer" : "not-allowed",
              opacity: valid ? 1 : 0.6,
            }}
          >
            Avisame
          </button>
        </form>
      )}
    </section>
  );
}

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "14px 0",
        borderTop: "1px solid var(--border-light)",
      }}
    >
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 13,
          color: "var(--text-muted)",
          flex: "0 0 28px",
        }}
      >
        {n}
      </span>
      <div>
        <strong style={{ fontSize: 16 }}>{t}</strong>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 14,
            color: "var(--text-body)",
            lineHeight: 1.55,
          }}
        >
          {d}
        </p>
      </div>
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontFamily: FONT_MONO,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: 0,
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontFamily: FONT_MONO,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 8,
  fontWeight: 600,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  margin: 0,
};

const ctaPrimary: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "9px 16px",
  borderRadius: 9,
  background: "var(--primary-bg)",
  color: "var(--primary-text)",
};

const ctaGhost: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  padding: "9px 16px",
  borderRadius: 9,
  border: "1px solid var(--border-color)",
  background: "var(--bg)",
  color: "var(--text)",
};
