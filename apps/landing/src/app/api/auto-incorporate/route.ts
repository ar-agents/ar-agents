/**
 * `POST /api/auto-incorporate` — machine-readable incorporation
 * surface for an external agent.
 *
 * The /incorporar wizard is for humans clicking through a form; this
 * endpoint is the same flow exposed as a single JSON-RPC-style call,
 * so a USA-LLC agent (or any external orchestrator) can self-incorporate
 * an Argentine sociedad-IA programmatically. The response is everything
 * the agent needs to deploy the starter app: validation findings, all
 * generated source files (package.json, agent.ts, .env.example, README.md),
 * the env-var manifest, the legal+operational checklist, and an audit-log
 * reference (HMAC-signed event recording the incorporation request).
 *
 * Idempotency: same input → same output (modulo timestamps + audit id).
 * No state is persisted server-side beyond the audit entry, so callers
 * get a clean re-runnable surface.
 *
 * Discovery: advertised in /api/discovery → packages → endpoints, so an
 * autonomous agent crawling the toolkit can find this surface and call
 * it without out-of-band documentation.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendAudit,
  backend as auditBackend,
  isSessionIdValid,
} from "@/lib/audit";

export const runtime = "edge";

// ─────────────────────────────────────────────────────────────────────────────
// Input schema (mirror of /incorporar wizard)
// ─────────────────────────────────────────────────────────────────────────────

const PIEZA_IDS = [
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

const REQUIRED_PIEZAS: ReadonlyArray<(typeof PIEZA_IDS)[number]> = [
  "identity",
  "gde-tad",
  "mercadopago",
  "banking",
  "facturacion",
];

const Body = z.object({
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
  /**
   * Optional client-supplied session id. If absent, the response includes
   * a server-generated UUID. The audit entry for this request lands under
   * that session id and is fetchable at /api/play/audit/{sessionId}.
   */
  sessionId: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation (mirror of @ar-agents/gde-tad validate_igj_inscription)
// ─────────────────────────────────────────────────────────────────────────────

type Finding = {
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

function normalizeCuit(raw: string): string {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

function validate(input: z.infer<typeof Body>): {
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
    findings.push({
      code: "sociedad_ia_pending_law",
      severity: "warning",
      field: "tipo",
      message:
        "El régimen sociedad-IA aún no está sancionado (anuncio Sturzenegger 28-abr-2026; estimado H1 2027). El repo generado opera bajo SAS estándar mientras tanto.",
    });
  }
  if (input.representante?.cuit) {
    const norm = normalizeCuit(input.representante.cuit);
    if (!/^\d{11}$/.test(norm)) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Generators (reuse the same pattern as the wizard)
// ─────────────────────────────────────────────────────────────────────────────

const PIEZA_VERSIONS: Record<string, string> = {
  identity: "^0.7.0",
  "identity-attest": "^0.4.2",
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
  shipping: "^0.2.0",
  "agentic-commerce-bridge": "^5.0.0",
  ap2: "^0.2.0",
  mcp: "^0.9.0",
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

function slugFor(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 40) || "sociedad-ia"
  );
}

function envVarsFor(piezas: string[]): Array<{ name: string; description: string }> {
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
  return vars;
}

function generatePackageJson(
  input: z.infer<typeof Body>,
  piezas: string[],
): string {
  const deps: Record<string, string> = {
    ai: "^6.0.0",
    next: "^16.0.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    zod: "^4.0.0",
    "@ai-sdk/anthropic": "^2.0.0",
  };
  for (const id of piezas) {
    deps[`@ar-agents/${id}`] = PIEZA_VERSIONS[id] ?? "*";
  }
  return JSON.stringify(
    {
      name: slugFor(input.denominacion),
      version: "0.1.0",
      private: true,
      description: `${input.denominacion} — operated by an LLM agent on top of @ar-agents/*. Generated by https://ar-agents.vercel.app/api/auto-incorporate.`,
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

function generateAgentTs(input: z.infer<typeof Body>, piezas: string[]): string {
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
  return `// Generated by https://ar-agents.vercel.app/api/auto-incorporate
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

function generateEnvExample(vars: Array<{ name: string; description: string }>): string {
  const lines = [
    "# Generado por https://ar-agents.vercel.app/api/auto-incorporate",
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

function generateReadme(input: z.infer<typeof Body>): string {
  return `# ${input.denominacion}\n\nOperated by an LLM agent on top of [@ar-agents/*](https://ar-agents.vercel.app).\nGenerated by [/api/auto-incorporate](https://ar-agents.vercel.app/api/auto-incorporate) — RFC-001 governance.\n\n## Tipo\n\n**${input.tipo}** — ${
    input.tipo === "SAS"
      ? "estándar, disponible hoy"
      : "pendiente sanción del régimen sociedad-IA (estimado H1 2027). Mientras tanto el código corre bajo SAS estándar."
  }\n\n## Quickstart\n\n\`\`\`bash\npnpm install\ncp .env.example .env.local\n$EDITOR .env.local\npnpm dev\n\`\`\`\n\n## Próximos pasos\n\n1. Cargar AFIP cert (5-10 días).\n2. Configurar Mercado Pago (1 día).\n3. Verificar Meta business para WhatsApp (10-15 días).\n4. Inscripción IGJ vía TAD (5-10 días).\n\n## Lectura\n\n- Cookbook: https://ar-agents.vercel.app/examples\n- Architecture: https://ar-agents.vercel.app/architecture\n- Threat model: https://ar-agents.vercel.app/security\n- RFC-001: https://ar-agents.vercel.app/rfcs/001\n`;
}

function generateChecklist(input: z.infer<typeof Body>): string[] {
  const slug = slugFor(input.denominacion);
  return [
    `Crear repo desde el template oficial: \`npx degit ar-agents/ar-agents/apps/sociedad-ia-starter ${slug}\` o copiar los archivos generados arriba en un repo nuevo.`,
    "Importar el repo a Vercel via vercel.com/new (Framework=Next.js).",
    "Pegar las variables de entorno listadas arriba en Vercel → Settings → Environment Variables.",
    "Solicitar cert X.509 en ARCA → Clave Fiscal → 'Asociar Servicio Web' (servicios `wsfe` y `ws_sr_constancia_inscripcion`). Subir cert + key a `.env`.",
    "Crear app en developers.mercadopago.com → Credenciales de Producción → pegar en `MERCADOPAGO_ACCESS_TOKEN`.",
    "Para WhatsApp Business: completar verificación de Meta Business Manager. Sin ella el cap es 5 destinatarios.",
    input.tipo === "SOCIEDAD-IA"
      ? "El régimen sociedad-IA aún no fue sancionado. Hasta entonces el código corre bajo SAS estándar con representante humano por RFC-001 § 3.1."
      : "Completar la inscripción IGJ vía TAD (5-10 días hábiles). Usar el tool `validate_igj_inscription` antes para evitar el ~30% de rechazos mecánicos.",
    "Agendar el morning loop del agente (`/api/cron/morning`) en Vercel Cron — lee DEC inbox + Boletín Oficial cada mañana.",
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const piezasSet = new Set(input.piezas);
  for (const r of REQUIRED_PIEZAS) piezasSet.add(r);
  const piezas = Array.from(piezasSet);

  const validation = validate(input);
  if (!validation.valid) {
    return NextResponse.json(
      {
        ok: false,
        validation,
        rfc001: { version: "1.0", url: "https://ar-agents.vercel.app/rfcs/001" },
      },
      { status: 422 },
    );
  }

  const envVars = envVarsFor(piezas);
  const config = {
    "package.json": generatePackageJson(input, piezas),
    "lib/agent.ts": generateAgentTs(input, piezas),
    ".env.example": generateEnvExample(envVars),
    "README.md": generateReadme(input),
  };

  const sessionId =
    input.sessionId && isSessionIdValid(input.sessionId)
      ? input.sessionId
      : crypto.randomUUID();

  const slug = slugFor(input.denominacion);
  const deployUrl = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(
    "https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter",
  )}&project-name=${encodeURIComponent(slug)}&env=${encodeURIComponent(
    envVars.map((v) => v.name).join(","),
  )}`;

  // Single audit-log entry recording this incorporation request. Matches
  // the surface the /play tools write to — same KV namespace, same HMAC.
  const auditEntry = await appendAudit(sessionId, {
    tool: "auto_incorporate",
    governance: "audit-logged",
    input: {
      denominacion: input.denominacion,
      tipo: input.tipo,
      capitalSocial: input.capitalSocial,
      objeto: input.objeto.slice(0, 200),
      piezas,
    },
    output: { slug, valid: validation.valid, files: Object.keys(config) },
  });

  return NextResponse.json(
    {
      ok: true,
      sociedad: {
        denominacion: input.denominacion,
        tipo: input.tipo,
        capitalSocial: input.capitalSocial,
        slug,
      },
      validation,
      config,
      envVars,
      checklist: generateChecklist(input),
      deploy: {
        target: "vercel",
        oneClickUrl: deployUrl,
        sourceUrl:
          "https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter",
        manualSteps: generateChecklist(input),
      },
      audit: {
        sessionId,
        backend: auditBackend(),
        entry: auditEntry,
        url: `https://ar-agents.vercel.app/api/play/audit/${sessionId}`,
        verifyUrl: `https://ar-agents.vercel.app/api/play/audit/${sessionId}?verify=1`,
      },
      rfc001: { version: "1.0", url: "https://ar-agents.vercel.app/rfcs/001" },
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "x-play-session": sessionId,
        "x-audit-backend": auditBackend(),
      },
    },
  );
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/auto-incorporate",
    method: "POST",
    description:
      "Machine-readable wizard for self-incorporating an Argentine sociedad-IA. POST a body with the schema below; receive package.json + agent.ts + .env.example + README.md + Vercel deploy URL + checklist + signed audit-log reference.",
    inputSchema: {
      denominacion: "string (3-200 chars)",
      tipo: "SAS | SRL | SA | SOCIEDAD-IA",
      capitalSocial: "number > 0 (ARS)",
      objeto: "string (20-2000 chars)",
      representante: "{ nombre: string, cuit: string }? (optional)",
      emailContacto: "string? (email)",
      piezas: `string[]? — subset of [${PIEZA_IDS.join(", ")}]; required pieces auto-added`,
      sessionId: "string? — for audit log continuity across calls",
    },
    requiredPiezas: REQUIRED_PIEZAS,
    rfc001: "https://ar-agents.vercel.app/rfcs/001",
    auditLogReadEndpoint: "/api/play/audit/{sessionId}",
  });
}
