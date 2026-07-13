/**
 * Pure-logic core of /api/auto-incorporate. Lives in lib/ so the
 * validators + generators are unit-testable without spinning up a
 * Next.js test server. The route handler in src/app/api/auto-incorporate
 * is now a thin wrapper that does HTTP plumbing + audit-log writes.
 */

import { z } from "zod";
import { lawIsLive } from "@/app/law-status";

export const PIEZA_IDS = [
  "identity",
  "identity-attest",
  "mi-argentina",
  "firma-digital",
  "gde-tad",
  "mercadopago",
  "mercadolibre",
  "banking",
  "facturacion",
  "igj",
  "boletin-oficial",
  "whatsapp",
  "shipping",
  "agentic-commerce-bridge",
  "ap2",
  "mcp",
] as const;

export const REQUIRED_PIEZAS: ReadonlyArray<(typeof PIEZA_IDS)[number]> = [
  "identity",
  "gde-tad",
  "mercadopago",
  "banking",
  "facturacion",
];

export const Body = z.object({
  denominacion: z.string().trim().min(3).max(200),
  tipo: z.enum(["SAS", "SRL", "SA", "SOCIEDAD-IA"]),
  capitalSocial: z.number().positive(),
  objeto: z.string().trim().min(20).max(2000),
  representante: z
    .object({
      nombre: z.string().min(1).max(120),
      cuit: z.string().min(1).max(20),
    })
    .optional(),
  emailContacto: z.string().email().optional(),
  piezas: z
    .array(z.enum(PIEZA_IDS))
    .min(1)
    .max(PIEZA_IDS.length)
    .default([...REQUIRED_PIEZAS]),
  sessionId: z.string().optional(),
});
export type IncorporateInput = z.infer<typeof Body>;

export type Finding = {
  code: string;
  severity: "error" | "warning";
  field: string;
  message: string;
};

const RESERVED = /\b(nacional|estatal|gobierno|estado|oficial)\b/i;

const MIN_CAPITAL: Record<string, number> = {
  SAS: 100_000,
  SRL: 100_000,
  SA: 30_000_000,
  "SOCIEDAD-IA": 1,
};

// The conventional separators a human types in a CUIT: ASCII whitespace, dot,
// soft hyphen (U+00AD), the Unicode dash block (U+2010–U+2015), and the ASCII
// hyphen. NOTHING else is stripped.
const CUIT_SEPARATORS = /[\s.­‐-―-]/g;

/**
 * Strip ONLY the conventional separators from a typed CUIT — never "everything
 * that isn't a digit". Stripping all non-digits would silently delete injected
 * junk (zero-width chars, bidi overrides, homoglyphs) and could fold two visually
 * different inputs onto the same 11-digit principal. By removing only known
 * separators, any contaminating character SURVIVES and the strict 11-ASCII-digit
 * check downstream REJECTS it instead of cleaning it. Use {@link canonicalCuit}
 * at trust boundaries to get the validated digits or null.
 */
export function normalizeCuit(raw: string): string {
  return String(raw ?? "").replace(CUIT_SEPARATORS, "");
}

/**
 * Canonical CUIT for use as an identity key (the audit `principal`). Returns the
 * 11-digit string iff, after stripping conventional separators, what remains is
 * EXACTLY 11 ASCII digits (`[0-9]`); otherwise null. Unicode digits, homoglyphs,
 * and any non-separator contamination yield null — a rejected input, never a
 * silently-cleaned or colliding principal.
 */
export function canonicalCuit(raw: string): string | null {
  const stripped = normalizeCuit(raw);
  return /^[0-9]{11}$/.test(stripped) ? stripped : null;
}

export function validate(input: IncorporateInput): {
  valid: boolean;
  findings: Finding[];
} {
  const findings: Finding[] = [];
  if (RESERVED.test(input.denominacion)) {
    findings.push({
      code: "denominacion_reserved_word",
      severity: "error",
      field: "denominacion",
      message:
        "La denominación contiene una palabra reservada por IGJ (nacional, estatal, gobierno, estado, oficial).",
    });
  }
  const min = MIN_CAPITAL[input.tipo] ?? 100_000;
  if (input.capitalSocial < min) {
    findings.push({
      code: "capital_below_minimum",
      severity: "error",
      field: "capitalSocial",
      message: `Capital $${input.capitalSocial.toLocaleString("es-AR")} por debajo del mínimo para ${input.tipo} ($${min.toLocaleString("es-AR")}).`,
    });
  }
  if (input.tipo === "SOCIEDAD-IA") {
    if (!lawIsLive) {
      findings.push({
        code: "sociedad_ia_pending_law",
        severity: "warning",
        field: "tipo",
        message:
          "El régimen sociedad-IA aún no está sancionado (anuncio Sturzenegger 28-abr-2026; estimado H1 2027).",
      });
    }
    // art. 14 (anteproyecto): the denomination of a sociedad automatizada must
    // include "automatizada". Enforced SERVER-SIDE here — not just in the eve tool's
    // client-side Zod .refine — so every surface that constitutes an automated
    // society (POST /api/auto-incorporate, /incorporar, the agent) rejects a
    // non-compliant name identically. Conventional types (SAS/SRL/SA) are exempt.
    if (!/\bautomatizada\b/i.test(input.denominacion)) {
      findings.push({
        code: "denominacion_missing_automatizada",
        severity: "error",
        field: "denominacion",
        message:
          "Una sociedad automatizada (art. 14) debe incluir la palabra 'automatizada' en su denominación.",
      });
    }
  }
  if (input.representante?.cuit) {
    if (!canonicalCuit(input.representante.cuit)) {
      findings.push({
        code: "cuit_representante_invalid",
        severity: "error",
        field: "representante.cuit",
        message: "El CUIT del representante debe tener 11 dígitos.",
      });
    }
  }
  return {
    valid: !findings.some((f) => f.severity === "error"),
    findings,
  };
}

const PIEZA_VERSIONS: Record<string, string> = {
  identity: "^0.8.1",
  "identity-attest": "^0.5.2",
  "mi-argentina": "^0.2.2",
  "firma-digital": "^0.2.2",
  "gde-tad": "^0.3.2",
  mercadopago: "^0.18.2",
  mercadolibre: "^0.5.1",
  banking: "^0.5.1",
  facturacion: "^0.4.1",
  igj: "^0.2.2",
  "boletin-oficial": "^0.2.1",
  whatsapp: "^0.5.1",
  shipping: "^0.3.2",
  "agentic-commerce-bridge": "^8.0.0",
  ap2: "^0.2.1",
  mcp: "^0.10.6",
};

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

const REQUIRES_CLIENT = new Set([
  "mercadopago",
  "mercadolibre",
  "whatsapp",
  "identity-attest",
  "mi-argentina",
]);

const INFRA_PACKAGES = new Set(["ap2", "agentic-commerce-bridge", "mcp"]);

export function slugFor(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 40) || "sociedad-ia"
  );
}

export function envVarsFor(piezas: string[]): Array<{ name: string; description: string }> {
  const set = new Set(piezas);
  const vars: Array<{ name: string; description: string }> = [
    { name: "ANTHROPIC_API_KEY", description: "LLM provider for the agent loop." },
  ];
  if (set.has("identity") || set.has("facturacion")) {
    vars.push(
      { name: "AFIP_CERT_PEM", description: "X.509 cert PEM (entire content)." },
      { name: "AFIP_KEY_PEM", description: "RSA private key PEM." },
      { name: "AFIP_CUIT", description: "CUIT whose Clave Fiscal authorized the cert." },
      { name: "AFIP_ENV", description: '"prod" or "homo".' },
    );
  }
  if (set.has("facturacion")) {
    vars.push({
      name: "AFIP_PTO_VTA",
      description: "Punto de venta enabled in AFIP for WSFE. Default 1.",
    });
  }
  if (set.has("mercadopago")) {
    vars.push(
      { name: "MERCADOPAGO_ACCESS_TOKEN", description: "Production token with write scope." },
      { name: "MERCADOPAGO_WEBHOOK_SECRET", description: "From the MP webhook setup." },
    );
  }
  if (set.has("whatsapp") || set.has("identity-attest")) {
    vars.push(
      { name: "WHATSAPP_ACCESS_TOKEN", description: "Meta WhatsApp Business token." },
      { name: "WHATSAPP_PHONE_NUMBER_ID", description: "From Meta Business Manager." },
      { name: "WHATSAPP_APP_SECRET", description: "For HMAC-SHA256 webhook verify." },
      { name: "WHATSAPP_VERIFY_TOKEN", description: "Token for webhook URL verification." },
    );
  }
  if (set.has("mi-argentina")) {
    vars.push(
      { name: "MI_ARGENTINA_CLIENT_ID", description: "From mi.argentina.gob.ar developer portal." },
      { name: "MI_ARGENTINA_CLIENT_SECRET", description: "Same source." },
      { name: "MI_ARGENTINA_REDIRECT_URI", description: "https://your-domain.example/api/auth/callback" },
    );
  }
  if (set.has("banking")) {
    vars.push({
      name: "BCRA_DEUDORES_URL",
      description: "Optional BCRA Central de Deudores adapter URL.",
    });
  }
  vars.push(
    { name: "AUDIT_HMAC_SECRET", description: "32+ char secret for audit-log HMAC." },
    {
      name: "REQUIRE_CONFIRMATION_WEBHOOK",
      description: "URL the toolkit hits for HITL gates (refunds / cancellations).",
    },
  );
  // art. 102 governance: the society's central enforcement consults ar-agents.ar
  // for the async approval queue (high-stakes acts) and the kill-switch.
  vars.push(
    {
      name: "SOCIETY_ID",
      description:
        "This society's id (the sessionId from when it was constituted). Keys the approval queue + kill-switch. Unset => the agent runs ungoverned (dev only).",
    },
    {
      name: "SOCIETY_GATE_TOKEN",
      description:
        "This society's runtime gate token, shown once at constitution. Proves to the approval queue that this deploy IS the society, so a stranger who knows the sessionId cannot flood its queue. Set it to the value returned when you constituted.",
    },
    {
      name: "AR_AGENTS_API_BASE",
      description: "Base URL for the governance API. Defaults to https://ar-agents.ar.",
    },
  );
  return vars;
}

export function generatePackageJson(input: IncorporateInput, piezas: string[]): string {
  const deps: Record<string, string> = {
    ai: "^6.0.0",
    next: "^16.0.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    zod: "^4.0.0",
    "@ai-sdk/anthropic": "^2.0.0",
    // Central enforcement (risk gate + art. 102 async approval + kill-switch).
    "@ar-agents/core": "^0.2.0",
  };
  for (const id of piezas) {
    deps[`@ar-agents/${id}`] = PIEZA_VERSIONS[id] ?? "*";
  }
  return JSON.stringify(
    {
      name: slugFor(input.denominacion),
      version: "0.1.0",
      private: true,
      description: `${input.denominacion}, operated by an LLM agent on top of @ar-agents/*. Generated by https://ar-agents.ar/api/auto-incorporate.`,
      scripts: { dev: "next dev", build: "next build", start: "next start" },
      dependencies: Object.fromEntries(
        Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)),
      ),
      engines: { node: ">=20.0.0" },
    },
    null,
    2,
  );
}

export function generateAgentTs(input: IncorporateInput, piezas: string[]): string {
  const imports: string[] = [];
  const toolSpread: string[] = [];
  for (const id of piezas.slice().sort()) {
    if (INFRA_PACKAGES.has(id)) continue;
    const fn = TOOLS_FN_NAME[id];
    if (!fn) continue;
    imports.push(`import { ${fn} } from "@ar-agents/${id}";`);
    if (REQUIRES_CLIENT.has(id)) {
      const v =
        id === "mercadopago"
          ? "mp"
          : id === "mercadolibre"
            ? "meli"
            : id === "whatsapp"
              ? "wa"
              : id === "identity-attest"
                ? "attest"
                : "miArg";
      toolSpread.push(`    ...(${v} ? ${fn}(${v}) : {}),`);
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
  if (piezas.includes("igj")) {
    imports.push(`import { LiveCkanFetcher } from "@ar-agents/igj";`);
  }
  if (piezas.includes("boletin-oficial")) {
    imports.push(
      `import { LiveBoFetcher, InMemoryBoSubscriptionAdapter } from "@ar-agents/boletin-oficial";`,
    );
  }
  return `// Generated by https://ar-agents.ar/api/auto-incorporate
// Sociedad: ${input.denominacion}
// Tipo: ${input.tipo}

import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
${imports.join("\n")}
import {
  getMpClient,
  getWhatsAppClient,
  getWsfeClient,
  getAfipPadronAdapter,
} from "./clients";
import { enforceRiskPolicy } from "@ar-agents/core";
import { approve, isHalted } from "./governance";

export function buildAgent() {
  const mp = getMpClient();
  const wa = getWhatsAppClient();
  const wsfe = getWsfeClient();
  const afip = getAfipPadronAdapter();

  return new Agent({
    model: anthropic("claude-sonnet-4-5"),
    stopWhen: stepCountIs(20),
    instructions:
      "Sos el agente operador de ${input.denominacion}. Operás bajo " +
      "RFC-001 (https://ar-agents.ar/rfcs/001). Toda acción de alto riesgo " +
      "(transferencias, facturación, actos irreversibles) espera una aprobación " +
      "humana asíncrona (art. 102) y puede frenarse con el kill-switch. Audit " +
      "log HMAC-firmado en cada tool call.",
    // enforceRiskPolicy is the central art. 102 gate: high-stakes tools defer to
    // a human approval (async queue at ar-agents.ar), a suspended society halts
    // every tool (kill-switch), and read tools pass through.
    tools: enforceRiskPolicy(
      {
${toolSpread.join("\n")}
      },
      { approve, isHalted },
    ),
  });
}
`;
}

export function generateEnvExample(vars: Array<{ name: string; description: string }>): string {
  const lines = [
    "# Generado por https://ar-agents.ar/api/auto-incorporate",
    "# Copialo a .env.local y completá los valores reales antes de deploy.",
    "",
  ];
  for (const v of vars) {
    lines.push(`# ${v.description}`);
    lines.push(`${v.name}=`);
    lines.push("");
  }
  return lines.join("\n");
}

export function generateReadme(input: IncorporateInput): string {
  return `# ${input.denominacion}\n\nOperated by an LLM agent on top of [@ar-agents/*](https://ar-agents.ar).\nGenerated by [/api/auto-incorporate](https://ar-agents.ar/api/auto-incorporate), RFC-001 governance.\n\n## Tipo\n\n**${input.tipo}**, ${
    input.tipo === "SAS"
      ? "estándar, disponible hoy"
      : "pendiente sanción del régimen sociedad-IA (estimado H1 2027). Mientras tanto el código corre bajo SAS estándar."
  }\n\n## Quickstart\n\n\`\`\`bash\npnpm install\ncp .env.example .env.local\n$EDITOR .env.local\npnpm dev\n\`\`\`\n\n## Próximos pasos\n\n1. Cargar AFIP cert (5-10 días).\n2. Configurar Mercado Pago (1 día).\n3. Verificar Meta business para WhatsApp (10-15 días).\n4. Inscripción IGJ vía TAD (5-10 días).\n\n## Lectura\n\n- Cookbook: https://ar-agents.ar/examples\n- Architecture: https://ar-agents.ar/architecture\n- Threat model: https://ar-agents.ar/security\n- RFC-001: https://ar-agents.ar/rfcs/001\n`;
}

/**
 * Founder-facing "what happens next" checklist. Shown on the draft card
 * (studio's preview_society tool, /play) and as `deploy.manualSteps` on the
 * real constitution response, so it doubles as the coach's only source for
 * this content (the coach never recites its own devops steps, see
 * apps/studio/src/coach/system-prompt.ts).
 *
 * Kept honest about what studio automates vs. what stays genuinely manual
 * (found live 2026-07-12, ROADMAP.md M1-5 friction log): studio deploys the
 * society's app with one click (M1-6) and configures Mercado Pago / AFIP /
 * WhatsApp credentials through a validated wizard (M3-1), so this list must
 * never again tell a non-technical founder to run `npx degit`, import a repo
 * to vercel.com/new by hand, or paste values into Vercel's Environment
 * Variables screen. The steps that ARE still genuinely manual (getting the
 * AFIP cert from ARCA, creating the Mercado Pago app, Meta business
 * verification) stay honest, but framed as inputs you hand to the studio
 * wizard, not as files you edit yourself. The raw degit/DIY path still
 * exists for developers at /incorporar (apps/landing/src/app/incorporar) and
 * is intentionally untouched.
 */
export function generateChecklist(input: IncorporateInput): string[] {
  return [
    "Constituí la sociedad acá arriba (con la firma del representante, art. 102). Es el único paso que hacés vos: todo lo que sigue lo automatiza el estudio.",
    "Desplegá el agente con un click desde el panel del estudio: crea el proyecto en Vercel y lo configura solo, sin tocar código ni la consola de Vercel.",
    "Configurá las credenciales que uses (Mercado Pago, WhatsApp, AFIP) desde el panel 'Credenciales' del estudio: completás los datos ahí y el estudio los valida y los carga en Vercel por vos.",
    "Para cobrar con Mercado Pago vas a necesitar una app en developers.mercadopago.com (Credenciales de producción). El token se pega en el panel de Credenciales del estudio, no en Vercel.",
    "Para facturar vas a necesitar un certificado X.509 de ARCA (Clave Fiscal → Administrador de Relaciones → Asociar Servicio Web, servicios `wsfe` y `ws_sr_constancia_inscripcion`). Se sube desde el panel de Credenciales, no hace falta editar ningún archivo.",
    "Para WhatsApp Business vas a necesitar verificar tu empresa en Meta Business Manager (sin eso el límite es 5 destinatarios). El token se carga después en el panel de Credenciales.",
    input.tipo === "SOCIEDAD-IA" && !lawIsLive
      ? "El régimen sociedad-IA aún no fue sancionado. Hasta entonces el código corre bajo SAS estándar con representante humano por RFC-001 § 3.1."
      : "Completar la inscripción IGJ vía TAD (5-10 días hábiles). Usar el tool `validate_igj_inscription` antes para evitar el ~30% de rechazos mecánicos.",
    "El loop matutino del agente (lee DEC inbox + Boletín Oficial cada mañana) ya viene agendado con el deploy: no hay que configurar nada.",
  ];
}

/**
 * Resolve the final piezas list from user input, always includes
 * REQUIRED_PIEZAS (identity, gde-tad, mercadopago, banking, facturacion)
 * even if the user didn't list them.
 */
export function resolvePiezas(piezas: string[]): string[] {
  const set = new Set(piezas);
  for (const r of REQUIRED_PIEZAS) set.add(r);
  return Array.from(set);
}
