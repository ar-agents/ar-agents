"use client";

/**
 * Client-side wizard for /incorporar. Generates a customised repo +
 * env-var manifest + deploy URL based on the user's answers.
 *
 * Pure client work — no server roundtrip. The output is deterministic
 * derived from the input, so reload-safe and shareable.
 */

import { useMemo, useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const PIEZAS = [
  {
    id: "identity",
    label: "Identity (CUIT validate + AFIP padron)",
    pkg: "@ar-agents/identity",
    required: true,
  },
  {
    id: "mi-argentina",
    label: "Mi Argentina OIDC (gov login)",
    pkg: "@ar-agents/mi-argentina",
    required: false,
  },
  {
    id: "firma-digital",
    label: "Firma digital (PKCS#7/CMS)",
    pkg: "@ar-agents/firma-digital",
    required: false,
  },
  {
    id: "gde-tad",
    label: "GDE/TAD (DEC inbox + IGJ pre-flight)",
    pkg: "@ar-agents/gde-tad",
    required: true,
  },
  {
    id: "mercadopago",
    label: "Mercado Pago (subs + payments + marketplace)",
    pkg: "@ar-agents/mercadopago",
    required: true,
  },
  {
    id: "banking",
    label: "Banking (CBU + BCRA credit + variables)",
    pkg: "@ar-agents/banking",
    required: true,
  },
  {
    id: "facturacion",
    label: "Facturación electrónica (AFIP WSFE)",
    pkg: "@ar-agents/facturacion",
    required: true,
  },
  {
    id: "igj",
    label: "IGJ public registry",
    pkg: "@ar-agents/igj",
    required: false,
  },
  {
    id: "boletin-oficial",
    label: "Boletín Oficial monitoring",
    pkg: "@ar-agents/boletin-oficial",
    required: false,
  },
  {
    id: "whatsapp",
    label: "WhatsApp Business",
    pkg: "@ar-agents/whatsapp",
    required: false,
  },
  {
    id: "identity-attest",
    label: "Identity attestation (OTP)",
    pkg: "@ar-agents/identity-attest",
    required: false,
  },
  {
    id: "shipping",
    label: "Shipping (Andreani / OCA / Correo)",
    pkg: "@ar-agents/shipping",
    required: false,
  },
  {
    id: "agentic-commerce-bridge",
    label: "ACP bridge (LLM-buyer checkout)",
    pkg: "@ar-agents/agentic-commerce-bridge",
    required: false,
  },
  {
    id: "ap2",
    label: "AP2 (Google mandate verification)",
    pkg: "@ar-agents/ap2",
    required: false,
  },
  {
    id: "mcp",
    label: "MCP host (Claude Desktop / Cursor)",
    pkg: "@ar-agents/mcp",
    required: false,
  },
] as const;

type Pieza = (typeof PIEZAS)[number];

interface FormState {
  denominacion: string;
  representante: string;
  cuitRepresentante: string;
  email: string;
  tipo: "SAS" | "SOCIEDAD-IA";
  capital: string;
  objeto: string;
  selected: Set<string>;
}

const REQUIRED_PIEZAS = PIEZAS.filter((p) => p.required).map((p) => p.id);

function envVarsFor(selected: Set<string>): Array<{ name: string; description: string }> {
  const vars: Array<{ name: string; description: string }> = [
    { name: "OPENAI_API_KEY or ANTHROPIC_API_KEY", description: "LLM provider for the agent loop." },
  ];
  if (selected.has("identity")) {
    vars.push(
      { name: "AFIP_CERT_PEM", description: "X.509 cert PEM (entire content, including BEGIN/END headers)." },
      { name: "AFIP_KEY_PEM", description: "RSA private key PEM. Pair with AFIP_CERT_PEM." },
      { name: "AFIP_CUIT", description: "CUIT whose Clave Fiscal authorized the cert." },
      { name: "AFIP_ENV", description: '"prod" or "homo".' },
    );
  }
  if (selected.has("facturacion")) {
    vars.push({
      name: "AFIP_PTO_VTA",
      description: "Punto de venta enabled in AFIP for WSFE. Default 1.",
    });
  }
  if (selected.has("mercadopago")) {
    vars.push(
      { name: "MERCADOPAGO_ACCESS_TOKEN", description: "Production token with write scope." },
      { name: "MERCADOPAGO_WEBHOOK_SECRET", description: "From your MP webhook setup." },
    );
  }
  if (selected.has("whatsapp") || selected.has("identity-attest")) {
    vars.push(
      { name: "WHATSAPP_ACCESS_TOKEN", description: "Meta WhatsApp Business token." },
      { name: "WHATSAPP_PHONE_NUMBER_ID", description: "From Meta Business Manager." },
      { name: "WHATSAPP_APP_SECRET", description: "For HMAC-SHA256 webhook signature verify." },
      { name: "WHATSAPP_VERIFY_TOKEN", description: "Token for webhook URL verification." },
    );
  }
  if (selected.has("mi-argentina")) {
    vars.push(
      { name: "MI_ARGENTINA_CLIENT_ID", description: "From mi.argentina.gob.ar developer portal." },
      { name: "MI_ARGENTINA_CLIENT_SECRET", description: "Same source." },
      { name: "MI_ARGENTINA_REDIRECT_URI", description: "https://your-domain.example/api/auth/callback" },
    );
  }
  if (selected.has("banking")) {
    vars.push({
      name: "BCRA_DEUDORES_URL",
      description: "Optional BCRA Central de Deudores adapter URL. Read-only public endpoints work without this.",
    });
  }
  if (selected.has("shipping")) {
    vars.push(
      { name: "ANDREANI_USER", description: "Andreani API username (optional)." },
      { name: "ANDREANI_PASSWORD", description: "Andreani API password (optional)." },
      { name: "OCA_USER", description: "OCA Epak API user (optional)." },
      { name: "OCA_PASSWORD", description: "OCA Epak API password (optional)." },
    );
  }
  if (selected.has("agentic-commerce-bridge")) {
    vars.push(
      { name: "ACP_SHARED_SECRET", description: "HMAC secret for ACP webhook verification." },
      { name: "ACP_CATALOG_URL", description: "Your /well-known/acp.json public URL." },
    );
  }
  vars.push(
    { name: "AUDIT_HMAC_SECRET", description: "32+ char secret for audit log HMAC. Independent of any other secret." },
    { name: "REQUIRE_CONFIRMATION_WEBHOOK", description: "URL the toolkit hits for HITL gates (refunds / cancellations)." },
  );
  return vars;
}

function generatePackageJson(state: FormState): string {
  const deps: Record<string, string> = {
    ai: "^6.0.0",
    next: "^16.0.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    zod: "^4.0.0",
  };
  const PIEZA_TO_VERSION: Record<string, string> = {
    identity: "^0.7.0",
    "mi-argentina": "^0.1.0",
    "firma-digital": "^0.1.0",
    "gde-tad": "^0.1.0",
    mercadopago: "^0.17.0",
    banking: "^0.4.0",
    facturacion: "^0.3.0",
    igj: "^0.1.0",
    "boletin-oficial": "^0.1.0",
    whatsapp: "^0.4.0",
    "identity-attest": "^0.4.0",
    shipping: "^0.2.0",
    "agentic-commerce-bridge": "^5.0.0",
    ap2: "^0.2.0",
    mcp: "^0.7.0",
  };
  for (const id of state.selected) {
    deps[`@ar-agents/${id}`] = PIEZA_TO_VERSION[id] ?? "*";
  }
  const slug = (state.denominacion || "acme-ai")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 40) || "sociedad-ia";
  return JSON.stringify(
    {
      name: slug,
      version: "0.1.0",
      private: true,
      description: `${state.denominacion || "ACME-AI SAS"} — operated by an LLM agent on top of @ar-agents/*. Generated by https://ar-agents.vercel.app/incorporar.`,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
      },
      dependencies: Object.fromEntries(
        Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)),
      ),
      engines: { node: ">=20.0.0" },
    },
    null,
    2,
  );
}

function generateAgentTs(state: FormState): string {
  const imports: string[] = [];
  const toolSpread: string[] = [];
  for (const id of state.selected) {
    const camelName = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    imports.push(`import { ${camelName}Tools } from "@ar-agents/${id}";`);
    toolSpread.push(`    ...${camelName}Tools(),`);
  }
  return `// Generated by https://ar-agents.vercel.app/incorporar
// Sociedad: ${state.denominacion || "ACME-AI SAS"}
// Tipo: ${state.tipo}

import { Experimental_Agent as Agent, stepCountIs } from "ai";
${imports.join("\n")}

export function buildAgent() {
  return new Agent({
    model: "anthropic/claude-sonnet-4.5",
    stopWhen: stepCountIs(20),
    system:
      "Sos el agente operador de ${state.denominacion || "ACME-AI SAS"}. Operás bajo " +
      "RFC-001 (https://ar-agents.vercel.app/rfcs/001). Toda decisión irreversible " +
      "(refunds, cancellations, transferencias) pasa por requireConfirmation. Audit " +
      "log HMAC-firmado en cada tool call.",
    tools: {
${toolSpread.join("\n")}
    },
  });
}
`;
}

function generateChecklist(state: FormState): string[] {
  const out = [
    "1. (5 min) Crear repositorio Git desde el código generado abajo. `npx degit ar-agents/templates/sociedad-ia-starter <slug>` o pegar manualmente.",
    "2. (5 min) Importar el repo a Vercel. Config: Framework=Next.js, Root=./.",
    "3. (10 min) Pegar los env vars de la lista en Vercel → Settings → Environment Variables.",
    "4. (1-3 días) Si vas a emitir factura electrónica: solicitar cert X.509 en ARCA → Clave Fiscal → 'Administrador de Relaciones' → 'Asociar Servicio Web'. Subir el cert + key al .env.",
    "5. (1 día) Si querés usar Mercado Pago real: crear app en developers.mercadopago.com → Credenciales de Producción → pegar en MERCADOPAGO_ACCESS_TOKEN.",
    "6. (10-15 días) Si vas a usar WhatsApp: Meta Business Manager → Verificación de Empresa. Sin esto el cap es 5 destinatarios.",
  ];
  if (state.tipo === "SOCIEDAD-IA") {
    out.push(
      "7. (espera regulatoria) Sociedad-IA propiamente dicha — anuncio Sturzenegger 28-abril-2026, ley estimada H1 2027. Mientras tanto operás como SAS con representante humano por RFC-001 § 3.1 (responsabilidad por capas).",
    );
  } else {
    out.push(
      "7. (5-10 días hábiles) Inscripción IGJ vía TAD. Usá el tool `validate_igj_inscription` en el repo generado para evitar el ~30% de rechazos mecánicos.",
    );
  }
  out.push(
    "8. (continuo) Agendar el morning loop del agente: lee DEC inbox + Boletín Oficial, planifica acciones, te manda WhatsApp con la cola crítica.",
  );
  return out;
}

const baseInputStyle: React.CSSProperties = {
  background: "var(--bg-tint)",
  border: "1px solid var(--text-muted)",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 14,
  color: "var(--text)",
  fontFamily: FONT_MONO,
  width: "100%",
};

export function IncorporarWizard() {
  const [state, setState] = useState<FormState>(() => ({
    denominacion: "",
    representante: "",
    cuitRepresentante: "",
    email: "",
    tipo: "SAS",
    capital: "200000",
    objeto: "",
    selected: new Set(REQUIRED_PIEZAS),
  }));
  const [output, setOutput] = useState<null | {
    pkgJson: string;
    agentTs: string;
    envVars: Array<{ name: string; description: string }>;
    checklist: string[];
    deployUrl: string;
  }>(null);

  const togglePieza = (id: string) => {
    setState((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, selected: next };
    });
  };

  const isReady = useMemo(
    () =>
      state.denominacion.trim().length > 2 &&
      state.email.includes("@") &&
      state.objeto.trim().length > 19,
    [state],
  );

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReady) return;
    const repo = "ar-agents/templates";
    const deployUrl = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(
      `https://github.com/${repo}/tree/main/sociedad-ia-starter`,
    )}&project-name=${encodeURIComponent(
      state.denominacion.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    )}&env=${encodeURIComponent(
      envVarsFor(state.selected)
        .map((v) => v.name.split(" or ")[0])
        .join(","),
    )}`;
    setOutput({
      pkgJson: generatePackageJson(state),
      agentTs: generateAgentTs(state),
      envVars: envVarsFor(state.selected),
      checklist: generateChecklist(state),
      deployUrl,
    });
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <form
        onSubmit={handleGenerate}
        style={{
          display: "grid",
          gap: 16,
          background: "var(--bg)",
          padding: 20,
          borderRadius: 8,
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontFamily: FONT_MONO, color: "var(--text-muted)" }}>
            Denominación
          </label>
          <input
            value={state.denominacion}
            onChange={(e) => setState((s) => ({ ...s, denominacion: e.target.value }))}
            placeholder="ACME-AI SAS"
            style={baseInputStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 13, fontFamily: FONT_MONO, color: "var(--text-muted)" }}>
              Representante humano (RFC-001 § 3.1)
            </label>
            <input
              value={state.representante}
              onChange={(e) => setState((s) => ({ ...s, representante: e.target.value }))}
              placeholder="Apellido, Nombre"
              style={baseInputStyle}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 13, fontFamily: FONT_MONO, color: "var(--text-muted)" }}>
              CUIT del representante
            </label>
            <input
              value={state.cuitRepresentante}
              onChange={(e) => setState((s) => ({ ...s, cuitRepresentante: e.target.value }))}
              placeholder="20-12345678-9"
              style={baseInputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 13, fontFamily: FONT_MONO, color: "var(--text-muted)" }}>
              Email contacto
            </label>
            <input
              value={state.email}
              onChange={(e) => setState((s) => ({ ...s, email: e.target.value }))}
              placeholder="naza@ejemplo.com"
              style={baseInputStyle}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 13, fontFamily: FONT_MONO, color: "var(--text-muted)" }}>
              Tipo
            </label>
            <select
              value={state.tipo}
              onChange={(e) =>
                setState((s) => ({ ...s, tipo: e.target.value as FormState["tipo"] }))
              }
              style={baseInputStyle}
            >
              <option value="SAS">SAS · disponible hoy</option>
              <option value="SOCIEDAD-IA">SOCIEDAD-IA · pendiente ley H1 2027</option>
            </select>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 13, fontFamily: FONT_MONO, color: "var(--text-muted)" }}>
              Capital social (ARS)
            </label>
            <input
              type="number"
              min={1}
              value={state.capital}
              onChange={(e) => setState((s) => ({ ...s, capital: e.target.value }))}
              style={baseInputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontFamily: FONT_MONO, color: "var(--text-muted)" }}>
            Objeto social (qué hace la sociedad — mínimo 20 caracteres)
          </label>
          <textarea
            value={state.objeto}
            onChange={(e) => setState((s) => ({ ...s, objeto: e.target.value }))}
            placeholder="Desarrollo y comercialización de productos de software propio para empresas argentinas."
            rows={3}
            style={{ ...baseInputStyle, fontFamily: "inherit", lineHeight: 1.5 }}
          />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontSize: 13, fontFamily: FONT_MONO, color: "var(--text-muted)" }}>
            Piezas del stack
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            {PIEZAS.map((p: Pieza) => {
              const isSel = state.selected.has(p.id);
              return (
                <label
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "8px 10px",
                    background: isSel ? "var(--bg-tint)" : "var(--bg)",
                    borderRadius: 6,
                    boxShadow: "var(--shadow-border)",
                    fontSize: 13,
                    cursor: p.required ? "not-allowed" : "pointer",
                    opacity: p.required ? 0.85 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    disabled={p.required}
                    onChange={() => !p.required && togglePieza(p.id)}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ flex: 1 }}>
                    {p.label}
                    {p.required && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          fontFamily: FONT_MONO,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                        }}
                      >
                        required
                      </span>
                    )}
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: FONT_MONO,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {p.pkg}
                    </div>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={!isReady}
          style={{
            background: isReady ? "var(--accent)" : "var(--text-muted)",
            color: "white",
            border: 0,
            borderRadius: 6,
            padding: "12px 20px",
            fontSize: 14,
            fontFamily: FONT_MONO,
            fontWeight: 600,
            cursor: isReady ? "pointer" : "not-allowed",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Generar config →
        </button>
      </form>

      {output && (
        <div style={{ marginTop: 24, display: "grid", gap: 24 }}>
          <section>
            <h3
              style={{
                fontSize: 14,
                fontFamily: FONT_MONO,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 8px",
              }}
            >
              1. Deploy
            </h3>
            <a
              href={output.deployUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                background: "#000",
                color: "#fff",
                textDecoration: "none",
                padding: "10px 16px",
                borderRadius: 6,
                fontSize: 13,
                fontFamily: FONT_MONO,
                fontWeight: 600,
              }}
            >
              ▲ Deploy to Vercel
            </a>
          </section>

          <section>
            <h3
              style={{
                fontSize: 14,
                fontFamily: FONT_MONO,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 8px",
              }}
            >
              2. package.json
            </h3>
            <pre
              style={{
                background: "var(--bg-tint)",
                padding: 16,
                borderRadius: 8,
                fontSize: 12,
                fontFamily: FONT_MONO,
                color: "var(--text-body)",
                overflow: "auto",
                boxShadow: "var(--shadow-border)",
                maxHeight: 320,
              }}
            >
              {output.pkgJson}
            </pre>
          </section>

          <section>
            <h3
              style={{
                fontSize: 14,
                fontFamily: FONT_MONO,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 8px",
              }}
            >
              3. agent.ts
            </h3>
            <pre
              style={{
                background: "var(--bg-tint)",
                padding: 16,
                borderRadius: 8,
                fontSize: 12,
                fontFamily: FONT_MONO,
                color: "var(--text-body)",
                overflow: "auto",
                boxShadow: "var(--shadow-border)",
                maxHeight: 320,
              }}
            >
              {output.agentTs}
            </pre>
          </section>

          <section>
            <h3
              style={{
                fontSize: 14,
                fontFamily: FONT_MONO,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 8px",
              }}
            >
              4. Variables de entorno
            </h3>
            <div style={{ display: "grid", gap: 6 }}>
              {output.envVars.map((v) => (
                <div
                  key={v.name}
                  style={{
                    background: "var(--bg)",
                    padding: "10px 14px",
                    borderRadius: 6,
                    boxShadow: "var(--card-shadow)",
                  }}
                >
                  <code style={{ fontFamily: FONT_MONO, fontSize: 13, color: "var(--text)" }}>
                    {v.name}
                  </code>
                  <div style={{ fontSize: 12, color: "var(--text-body)", marginTop: 4 }}>
                    {v.description}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3
              style={{
                fontSize: 14,
                fontFamily: FONT_MONO,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 8px",
              }}
            >
              5. Checklist legal + operativo
            </h3>
            <ol style={{ display: "grid", gap: 8, paddingLeft: 20, fontSize: 14, color: "var(--text-body)" }}>
              {output.checklist.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
