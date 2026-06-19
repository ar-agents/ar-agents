"use client";

// The "prompteándola" surface: a person describes the society in one sentence,
// we show what would be constituted (dry run, /api/incorporate-preview, which
// constitutes nothing). The actual irreversible act stays gated behind a human
// approval (art. 102), surfaced as the note below. No CSS-only animation, so it
// behaves under prefers-reduced-motion.

import { useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type PreviewResult = {
  ok: true;
  sociedad: { denominacion: string; tipo: string; capitalSocial: number; slug: string };
  draft: {
    objeto: string;
    piezas: string[];
    representante?: { nombre: string; cuit: string } | null;
    emailContacto?: string | null;
  };
  validation: { valid: boolean; findings: { severity: "error" | "warning"; message: string }[] };
  configFiles: string[];
  envVars: { name: string }[];
  deploy: { oneClickUrl: string };
  note: string;
};

const EXAMPLES = [
  "Una pyme de software que vende suscripciones y cobra por Mercado Pago.",
  "Un emprendimiento que factura, atiende clientes por WhatsApp y hace envíos.",
  "Una sociedad para gestionar alquileres y emitir facturas a inquilinos.",
];

const ERROR_COPY: Record<string, string> = {
  empty_prompt: "Escribí una descripción de la sociedad.",
  invalid_draft: "No pude estructurar eso. Probá describirlo un poco más claro.",
  generation_failed: "El modelo no respondió. Reintentá en un momento.",
  rate_limited: "Demasiadas pruebas seguidas. Esperá un rato y reintentá.",
  bad_json: "Algo salió mal con el pedido. Reintentá.",
};

const box: React.CSSProperties = {
  border: "1px solid var(--border-color)",
  borderRadius: 10,
  background: "var(--bg-tint)",
  padding: 16,
};

export function IncorporarPrompt() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3 || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/incorporate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = (await res.json()) as PreviewResult | { ok: false; error: string };
      if (!res.ok || !("ok" in data) || !data.ok) {
        const code = "error" in data ? data.error : "generation_failed";
        setError(ERROR_COPY[code] ?? "No se pudo previsualizar. Reintentá.");
      } else {
        setResult(data);
      }
    } catch {
      setError("No se pudo conectar. Reintentá.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, margin: "8px 0 4px" }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(prompt);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describí tu sociedad en una frase. Ej: una pyme de software que vende suscripciones y cobra por Mercado Pago."
          rows={3}
          style={{
            width: "100%",
            resize: "vertical",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--border-color)",
            background: "var(--bg)",
            color: "var(--text)",
            font: "15px/1.5 var(--font-geist-sans), Arial, sans-serif",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button
            type="submit"
            disabled={loading || prompt.trim().length < 3}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid var(--accent)",
              background: loading ? "var(--bg-tint)" : "var(--accent)",
              color: loading ? "var(--text-muted)" : "var(--bg)",
              font: "600 14px var(--font-geist-sans), Arial, sans-serif",
              cursor: loading || prompt.trim().length < 3 ? "default" : "pointer",
              opacity: prompt.trim().length < 3 ? 0.6 : 1,
            }}
          >
            {loading ? "Pensando..." : "Ver mi sociedad"}
          </button>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Dry run. No constituye nada.
          </span>
        </div>
      </form>

      {!result && !loading && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setPrompt(ex);
                void run(ex);
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid var(--border-color)",
                background: "transparent",
                color: "var(--text-body)",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ ...box, borderColor: "var(--accent)", color: "var(--text-body)" }}>{error}</div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={box}>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Tu sociedad sería</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: 2 }}>
              {result.sociedad.denominacion}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-body)", marginTop: 4 }}>
              {result.sociedad.tipo} · capital ${result.sociedad.capitalSocial.toLocaleString("es-AR")}
              {result.draft.representante ? ` · repr. ${result.draft.representante.nombre}` : ""}
            </div>
            <p style={{ fontSize: 14, color: "var(--text-body)", margin: "10px 0 0", lineHeight: 1.5 }}>
              {result.draft.objeto}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {result.draft.piezas.map((p) => (
                <span
                  key={p}
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 12,
                    padding: "3px 8px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    color: "var(--code-text)",
                    background: "var(--code-bg)",
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {result.validation.findings.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {result.validation.findings.map((f, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    color: f.severity === "error" ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {f.severity === "error" ? "Error: " : "Nota: "}
                  {f.message}
                </div>
              ))}
            </div>
          )}

          <div style={{ ...box, fontSize: 13, color: "var(--text-body)" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>
              Genera {result.configFiles.length} archivos + {result.envVars.length} variables, listo para deploy en Vercel:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {result.configFiles.map((file) => (
                <code key={file} style={{ fontFamily: FONT_MONO, fontSize: 12, color: "var(--code-text)" }}>
                  {file}
                </code>
              ))}
            </div>
          </div>

          <div style={{ ...box, borderColor: "var(--accent)" }}>
            <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>
              Esto es un dry run. No se constituyó nada.
            </div>
            <p style={{ fontSize: 13, color: "var(--text-body)", margin: "6px 0 0", lineHeight: 1.5 }}>
              Constituir de verdad es irreversible, así que necesita la aprobación de una persona y queda
              firmado en el audit log (art. 102). Esa parte la hace el agente, que para acá y te pregunta
              antes de constituir.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
