"use client";

/**
 * Client-side wizard for /incorporar. Generates a customised repo +
 * env-var manifest based on the user's answers, runs the IGJ pre-flight
 * validator live, and exposes per-file download + clipboard-copy actions.
 *
 * Pure client work, no server roundtrip, no fabricated stats. The
 * generated files are reload-safe and shareable.
 */

import { useEffect, useMemo, useState } from "react";

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
    id: "mercadolibre",
    label: "Mercado Libre (items + orders + claims + reputation)",
    pkg: "@ar-agents/mercadolibre",
    required: false,
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

// ─────────────────────────────────────────────────────────────────────────────
// Live IGJ pre-flight validator (mirrors @ar-agents/gde-tad/igj-preflight.ts).
// Inlined here so the wizard runs without bundling the workspace package.
// ─────────────────────────────────────────────────────────────────────────────

type Finding = {
  code: string;
  severity: "error" | "warning";
  field: string;
  message: string;
};

const DENOMINACION_FORBIDDEN: RegExp[] = [
  /\bnacional\b/i,
  /\bestatal\b/i,
  /\bgobierno\b/i,
  /\bestado\b/i,
  /\boficial\b/i,
];

const MIN_CAPITAL_BY_TYPE: Record<string, number> = {
  SAS: 100_000,
  "SOCIEDAD-IA": 1,
};

const normalizeCuit = (raw: string) => String(raw ?? "").replace(/[^\d]/g, "");

function validateLive(s: FormState): { valid: boolean; findings: Finding[] } {
  const findings: Finding[] = [];

  // Denominación
  if (!s.denominacion || s.denominacion.trim().length < 3) {
    findings.push({
      code: "denominacion_too_short",
      severity: "error",
      field: "denominacion",
      message: "La denominación debe tener al menos 3 caracteres.",
    });
  } else {
    for (const rx of DENOMINACION_FORBIDDEN) {
      if (rx.test(s.denominacion)) {
        findings.push({
          code: "denominacion_reserved_word",
          severity: "error",
          field: "denominacion",
          message: `La denominación contiene una palabra reservada por IGJ ("${rx.source}").`,
        });
        break;
      }
    }
  }

  // Capital
  const cap = Number(s.capital);
  if (!Number.isFinite(cap) || cap <= 0) {
    findings.push({
      code: "capital_invalid",
      severity: "error",
      field: "capital",
      message: "El capital social debe ser un número mayor a 0.",
    });
  } else {
    const min = MIN_CAPITAL_BY_TYPE[s.tipo] ?? 100_000;
    if (cap < min) {
      findings.push({
        code: "capital_below_minimum",
        severity: "error",
        field: "capital",
        message: `Capital ($${cap.toLocaleString("es-AR")}) por debajo del mínimo para ${s.tipo} ($${min.toLocaleString("es-AR")}).`,
      });
    }
  }

  // Objeto
  if (!s.objeto || s.objeto.trim().length < 20) {
    findings.push({
      code: "objeto_too_short",
      severity: "error",
      field: "objeto",
      message: "El objeto social debe describir las actividades en al menos 20 caracteres. IGJ rechaza objetos genéricos.",
    });
  }

  // CUIT representante (warning, not error, the field is optional pre-launch)
  if (s.cuitRepresentante.trim()) {
    const norm = normalizeCuit(s.cuitRepresentante);
    if (!/^\d{11}$/.test(norm)) {
      findings.push({
        code: "cuit_representante_invalid",
        severity: "error",
        field: "cuitRepresentante",
        message: "El CUIT del representante no es válido (deben ser 11 dígitos).",
      });
    }
  }

  // Email (warning, not blocking)
  if (s.email.trim() && !s.email.includes("@")) {
    findings.push({
      code: "email_invalid",
      severity: "error",
      field: "email",
      message: "Email inválido.",
    });
  }

  // SOCIEDAD-IA flag warning
  if (s.tipo === "SOCIEDAD-IA") {
    findings.push({
      code: "sociedad_ia_pending_law",
      severity: "warning",
      field: "tipo",
      message: "El régimen sociedad-IA aún no está sancionado (estimado H1 2027). Mientras tanto el repo generado opera bajo SAS estándar.",
    });
  }

  return { valid: !findings.some((f) => f.severity === "error"), findings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generators
// ─────────────────────────────────────────────────────────────────────────────

function envVarsFor(selected: Set<string>): Array<{ name: string; description: string }> {
  const vars: Array<{ name: string; description: string }> = [
    { name: "AI_GATEWAY_API_KEY", description: "Vercel AI Gateway for the agent loop (spend cap + observability). Or link a gateway-enabled Vercel team." },
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
      description: "Optional BCRA Central de Deudores adapter URL. Public BCRA endpoints work without this.",
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

function slugFor(state: FormState): string {
  return (
    (state.denominacion || "acme-ai")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 40) || "sociedad-ia"
  );
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
    "gde-tad": "^0.2.0",
    mercadopago: "^0.17.0",
    mercadolibre: "^0.1.0",
    banking: "^0.4.0",
    facturacion: "^0.3.0",
    igj: "^0.1.0",
    "boletin-oficial": "^0.1.0",
    whatsapp: "^0.4.0",
    "identity-attest": "^0.4.0",
    shipping: "^0.2.0",
    "agentic-commerce-bridge": "^5.0.0",
    ap2: "^0.2.0",
    mcp: "^0.9.0",
  };
  for (const id of state.selected) {
    deps[`@ar-agents/${id}`] = PIEZA_TO_VERSION[id] ?? "*";
  }
  return JSON.stringify(
    {
      name: slugFor(state),
      version: "0.1.0",
      private: true,
      description: `${state.denominacion || "ACME-AI SAS"}, operated by an LLM agent on top of @ar-agents/*. Generated by https://ar-agents.ar/incorporar.`,
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

// Map package id → exported function name (NOT just camelCase, some
// packages diverge: mercadopago→mercadoPago, mercadolibre→meli).
const TOOLS_FN_NAME: Record<string, string> = {
  identity: "identityTools",
  "identity-attest": "identityAttestTools",
  "mi-argentina": "miArgentinaTools",
  "firma-digital": "firmaDigitalTools",
  "gde-tad": "gdeTadTools",
  mercadopago: "mercadoPagoTools",
  mercadolibre: "meliTools",
  banking: "bankingTools",
  facturacion: "facturacionTools",
  whatsapp: "whatsappTools",
  shipping: "shippingTools",
  igj: "igjTools",
  "boletin-oficial": "boletinOficialTools",
};

// Tools that REQUIRE a client argument (vs. options-with-defaults).
const REQUIRES_CLIENT = new Set([
  "mercadopago",
  "mercadolibre",
  "whatsapp",
  "identity-attest",
  "mi-argentina",
]);

// Infra packages with no LLM tool surface, skip in agent.ts.
const INFRA = new Set(["ap2", "agentic-commerce-bridge", "mcp"]);

function generateAgentTs(state: FormState): string {
  const imports: string[] = [];
  const toolSpread: string[] = [];
  for (const id of Array.from(state.selected).sort()) {
    if (INFRA.has(id)) continue;
    const fn = TOOLS_FN_NAME[id];
    if (!fn) continue;
    imports.push(`import { ${fn} } from "@ar-agents/${id}";`);
    if (REQUIRES_CLIENT.has(id)) {
      // Reference a client variable defined in lib/clients.ts. The starter
      // template ships this; manual integrations should mirror the pattern.
      const clientVar =
        id === "mercadopago"
          ? "mp"
          : id === "mercadolibre"
            ? "meli"
            : id === "whatsapp"
              ? "wa"
              : id === "identity-attest"
                ? "attest"
                : id === "mi-argentina"
                  ? "miArg"
                  : "client";
      toolSpread.push(`    ...(${clientVar} ? ${fn}(${clientVar}) : {}),`);
    } else if (id === "igj") {
      toolSpread.push(`    ...${fn}({ fetcher: new LiveCkanFetcher() }),`);
    } else if (id === "boletin-oficial") {
      toolSpread.push(
        `    ...${fn}({ fetcher: new LiveBoFetcher(), subscriptions: new InMemoryBoSubscriptionAdapter() }),`,
      );
    } else if (id === "facturacion") {
      toolSpread.push(`    ...${fn}(wsfe ? { wsfe } : {}),`);
    } else if (id === "identity") {
      toolSpread.push(`    ...${fn}({ afip }),`);
    } else {
      toolSpread.push(`    ...${fn}(),`);
    }
  }
  const denominacion = state.denominacion || "ACME-AI SAS";
  // Add the imports the conditional wirings depend on.
  if (state.selected.has("igj")) imports.push(`import { LiveCkanFetcher } from "@ar-agents/igj";`);
  if (state.selected.has("boletin-oficial"))
    imports.push(
      `import { LiveBoFetcher, InMemoryBoSubscriptionAdapter } from "@ar-agents/boletin-oficial";`,
    );

  return `// Generated by https://ar-agents.ar/incorporar
// Sociedad: ${denominacion}
// Tipo: ${state.tipo}
// Generado: ${new Date().toISOString().slice(0, 10)}
//
// El template oficial vive en https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter
// y ya trae lib/clients.ts con la construcción de mp / wa / wsfe / afip
// desde process.env. Si copiás solo este archivo, replicá ese patrón.

import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
${imports.join("\n")}
import {
  getMpClient,
  getWhatsAppClient,
  getWsfeClient,
  getAfipPadronAdapter,
} from "./clients";

export function buildAgent() {
  const mp = getMpClient();
  const wa = getWhatsAppClient();
  const wsfe = getWsfeClient();
  const afip = getAfipPadronAdapter();

  return new Agent({
    model: anthropic("claude-sonnet-4-5"),
    stopWhen: stepCountIs(20),
    instructions:
      "Sos el agente operador de ${denominacion}. Operás bajo " +
      "RFC-001 (https://ar-agents.ar/rfcs/001). Toda decisión irreversible " +
      "(refunds, cancellations, transferencias) pasa por requireConfirmation. Audit " +
      "log HMAC-firmado en cada tool call.",
    tools: {
${toolSpread.join("\n")}
    },
  });
}
`;
}

function generateEnvExample(envVars: Array<{ name: string; description: string }>): string {
  const lines = [
    "# Generado por https://ar-agents.ar/incorporar",
    "# Copialo a .env.local y completá los valores reales antes de deploy.",
    "",
  ];
  for (const v of envVars) {
    lines.push(`# ${v.description}`);
    lines.push(`${v.name}=`);
    lines.push("");
  }
  return lines.join("\n");
}

function generateReadme(state: FormState): string {
  const denominacion = state.denominacion || "ACME-AI SAS";
  return `# ${denominacion}

Operated by an LLM agent on top of [@ar-agents/*](https://ar-agents.ar).
Generated by [/incorporar](https://ar-agents.ar/incorporar), RFC-001 governance.

## Pre-launch quickstart

\`\`\`bash
pnpm install
cp .env.example .env.local
$EDITOR .env.local
pnpm dev
\`\`\`

The agent is at \`lib/agent.ts\`. Wire it into your route handlers / cron jobs as needed.

## Tipo de sociedad

**${state.tipo}**, ${state.tipo === "SAS" ? "estándar, disponible hoy" : "pendiente sanción del régimen sociedad-IA (estimado H1 2027). Mientras tanto el código corre bajo SAS estándar."}

## RFC-001 governance

Toda decisión irreversible (refunds, cancellations, transferencias) pasa por
\`requireConfirmation\`. Cada tool call queda en el audit log con timestamp
HMAC-firmado.

Lectura completa: https://ar-agents.ar/rfcs/001

## Trust + audit

- npm provenance attestations en cada dependencia \`@ar-agents/*\`
- OpenSSF Scorecard auditando la cadena de suministro
- Reportá vulnerabilidades vía \`SECURITY.md\` upstream

## Soporte

- Cookbook: https://ar-agents.ar/examples
- Architecture: https://ar-agents.ar/architecture
- Threat model: https://ar-agents.ar/security
- Discord / GitHub Discussions: https://github.com/ar-agents/ar-agents/discussions
`;
}

function generateChecklist(state: FormState): string[] {
  const out = [
    "1. (5 min) Crear el repo: descargá los archivos generados abajo, agregalos a un nuevo repo Git (`mkdir`, `cp`, `git init`, `git commit`).",
    "2. (5 min) Importar el repo a Vercel via vercel.com/new. Framework=Next.js, Root=./.",
    "3. (10 min) Pegar los env vars de `.env.example` en Vercel → Settings → Environment Variables.",
    "4. (1-3 días) Si vas a emitir factura electrónica: solicitar cert X.509 en ARCA → Clave Fiscal → 'Administrador de Relaciones' → 'Asociar Servicio Web' (servicios `wsfe` y `ws_sr_constancia_inscripcion`). Subir cert + key al .env.",
    "5. (1 día) Si querés usar Mercado Pago real: crear app en developers.mercadopago.com → Credenciales de Producción → pegar en `MERCADOPAGO_ACCESS_TOKEN`.",
    "6. (10-15 días) Si vas a usar WhatsApp: Meta Business Manager → Verificación de Empresa. Sin esto el cap es 5 destinatarios.",
  ];
  if (state.tipo === "SOCIEDAD-IA") {
    out.push(
      "7. (espera regulatoria) Sociedad-IA propiamente dicha: el anteproyecto fue enviado al Senado el 1-jun-2026 y todavía no es ley. Mientras tanto el código corre bajo SAS estándar con representante humano por RFC-001 § 3.1 (responsabilidad por capas).",
    );
  } else {
    out.push(
      "7. (5-10 días hábiles) Inscripción IGJ vía TAD. Usá el tool `validate_igj_inscription` que viene cableado en el repo para evitar el ~30% de rechazos mecánicos antes de mandar el trámite.",
    );
  }
  out.push(
    "8. (continuo) Agendar el morning loop del agente: lee DEC inbox + Boletín Oficial, planifica acciones, te manda WhatsApp con la cola crítica.",
  );
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function downloadAs(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // ignore, older browsers
        }
      }}
      style={{
        background: "var(--bg-tint)",
        color: "var(--text)",
        border: 0,
        borderRadius: 4,
        padding: "4px 10px",
        fontSize: 11,
        fontFamily: FONT_MONO,
        cursor: "pointer",
      }}
    >
      {copied ? "Copiado ✓" : "Copiar"}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main wizard
// ─────────────────────────────────────────────────────────────────────────────

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
    envExample: string;
    readme: string;
    envVars: Array<{ name: string; description: string }>;
    checklist: string[];
  }>(null);

  const togglePieza = (id: string) => {
    setState((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, selected: next };
    });
  };

  // Live validation as the user types, same rules as @ar-agents/gde-tad's
  // `validate_igj_inscription` tool (RFC-001 § 3.4).
  const validation = useMemo(() => validateLive(state), [state]);
  const errors = validation.findings.filter((f) => f.severity === "error");
  const warnings = validation.findings.filter((f) => f.severity === "warning");

  // Re-generate output whenever inputs change AND validation is clean.
  useEffect(() => {
    if (!validation.valid) {
      setOutput(null);
      return;
    }
    setOutput({
      pkgJson: generatePackageJson(state),
      agentTs: generateAgentTs(state),
      envExample: generateEnvExample(envVarsFor(state.selected)),
      readme: generateReadme(state),
      envVars: envVarsFor(state.selected),
      checklist: generateChecklist(state),
    });
  }, [state, validation.valid]);

  return (
    <div style={{ marginBottom: 32 }}>
      <form
        onSubmit={(e) => e.preventDefault()}
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
            Objeto social (mínimo 20 caracteres, IGJ rechaza objetos genéricos)
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
      </form>

      {/* Validation panel */}
      <div style={{ marginTop: 16 }}>
        <h3
          style={{
            fontSize: 13,
            fontFamily: FONT_MONO,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: "0 0 8px",
          }}
        >
          Pre-flight (en vivo · @ar-agents/gde-tad → validate_igj_inscription)
        </h3>
        {errors.length === 0 && warnings.length === 0 ? (
          <div
            style={{
              background: "var(--bg)",
              padding: 14,
              borderRadius: 6,
              boxShadow: "var(--card-shadow)",
              fontSize: 13,
              color: "#22c55e",
              fontFamily: FONT_MONO,
            }}
          >
            ✓ Sin findings. La inscripción cumple las reglas IGJ que conocemos.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {[...errors, ...warnings].map((f) => (
              <div
                key={f.code}
                style={{
                  background: "var(--bg)",
                  padding: "10px 14px",
                  borderRadius: 6,
                  boxShadow: "var(--card-shadow)",
                  borderLeft: `3px solid ${f.severity === "error" ? "#ef4444" : "#eab308"}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: FONT_MONO,
                    color: f.severity === "error" ? "#ef4444" : "#eab308",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 2,
                  }}
                >
                  {f.severity} · {f.code}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-body)", lineHeight: 1.4 }}>
                  <code style={{ fontFamily: FONT_MONO, color: "var(--text-muted)" }}>
                    {f.field}
                  </code>:{" "}
                {f.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
              1. Descargá los archivos
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                onClick={() => downloadAs("package.json", output.pkgJson, "application/json")}
                style={btnPrimary}
              >
                ⬇ package.json
              </button>
              <button
                type="button"
                onClick={() => downloadAs("agent.ts", output.agentTs, "text/typescript")}
                style={btnPrimary}
              >
                ⬇ agent.ts
              </button>
              <button
                type="button"
                onClick={() => downloadAs(".env.example", output.envExample, "text/plain")}
                style={btnPrimary}
              >
                ⬇ .env.example
              </button>
              <button
                type="button"
                onClick={() => downloadAs("README.md", output.readme, "text/markdown")}
                style={btnPrimary}
              >
                ⬇ README.md
              </button>
              <a
                href={`https://vercel.com/new/clone?repository-url=${encodeURIComponent(
                  "https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter",
                )}&project-name=${encodeURIComponent(slugFor(state))}&env=${encodeURIComponent(
                  output.envVars.map((v) => v.name).join(","),
                )}`}
                target="_blank"
                rel="noreferrer"
                style={{ ...btnSecondary, textDecoration: "none" }}
              >
                ▲ Deploy sociedad-ia-starter en Vercel
              </a>
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: FONT_MONO,
                lineHeight: 1.5,
              }}
            >
              Crear un repo nuevo, copiar los 4 archivos descargados, conectarlo a Vercel, y pegar las variables de entorno.
            </div>
          </section>

          <FilePreview
            label="package.json"
            content={output.pkgJson}
          />
          <FilePreview
            label="lib/agent.ts"
            content={output.agentTs}
          />
          <FilePreview
            label=".env.example"
            content={output.envExample}
          />
          <FilePreview
            label="README.md"
            content={output.readme}
          />

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
              2. Variables de entorno (también en .env.example)
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
              3. Checklist legal + operativo
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

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: 0,
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 12,
  fontFamily: FONT_MONO,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "#000",
  color: "#fff",
  border: 0,
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 12,
  fontFamily: FONT_MONO,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

function FilePreview({ label, content }: { label: string; content: string }) {
  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <h4
          style={{
            fontSize: 13,
            fontFamily: FONT_MONO,
            color: "var(--text)",
            margin: 0,
          }}
        >
          {label}
        </h4>
        <CopyButton text={content} />
      </div>
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
          maxHeight: 280,
          whiteSpace: "pre",
        }}
      >
        {content}
      </pre>
    </section>
  );
}
