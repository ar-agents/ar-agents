/**
 * Pure-logic core of /api/auto-incorporate. Lives in lib/ so the
 * validators + generators are unit-testable without spinning up a
 * Next.js test server. The route handler in src/app/api/auto-incorporate
 * is now a thin wrapper that does HTTP plumbing + audit-log writes.
 */

import { z } from "zod";

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
  "treasury",
  "igj",
  "boletin-oficial",
  "whatsapp",
  "shipping",
  "agentic-commerce-bridge",
  "ap2",
  "mcp",
  "x402",
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
  // ALE (Kargieman): designar un beneficiario público (p.ej. el FSA) con un % de los
  // retornos netos habilita alivio calibrado de responsabilidad solidaria.
  beneficiarioPublico: z
    .object({
      entidad: z.string().trim().min(1).max(120),
      porcentaje: z.number().min(0).max(100),
    })
    .optional(),
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

export function normalizeCuit(raw: string): string {
  return String(raw ?? "").replace(/[^\d]/g, "");
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
    findings.push({
      code: "sociedad_ia_pending_law",
      severity: "warning",
      field: "tipo",
      message:
        "El régimen sociedad-IA aún no está sancionado (anuncio Sturzenegger 28-abr-2026; estimado H1 2027).",
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
  treasury: "^0.2.0",
  igj: "^0.1.0",
  "boletin-oficial": "^0.1.0",
  whatsapp: "^0.4.0",
  shipping: "^0.2.0",
  "agentic-commerce-bridge": "^5.0.0",
  ap2: "^0.2.0",
  mcp: "^0.9.0",
  x402: "^0.1.0",
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
  treasury: "treasuryTools",
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

const INFRA_PACKAGES = new Set(["ap2", "agentic-commerce-bridge", "mcp", "x402"]);

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
    { name: "AI_GATEWAY_API_KEY", description: "Vercel AI Gateway key for the agent loop (spend cap + observability). Optional if the Vercel project is linked to a gateway-enabled team." },
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
  if (set.has("treasury")) {
    vars.push(
      {
        name: "MANTECA_API_KEY",
        description:
          "Manteca PSAV key (sent as md-api-key) for the USDC->ARS off-ramp. Without it only the pure treasury tools run.",
      },
      {
        name: "MANTECA_USER_ID",
        description: "Manteca user/company id that owns the crypto balance + bank account.",
      },
      {
        name: "MANTECA_BANK_ACCOUNT_ID",
        description: "Registered destination bank account id (the society's CVU) for ARS payout.",
      },
      {
        name: "MANTECA_BASE_URL",
        description:
          "Optional Manteca API base URL (default https://api.manteca.dev; confirm at onboarding).",
      },
      {
        name: "RIPIO_CLIENT_ID",
        description:
          "Ripio B2B OAuth2 client id for the USDC->ARS off-ramp (alternative PSAV; the open sandbox is the soonest live path). Set the RIPIO_* group OR the MANTECA_* group.",
      },
      {
        name: "RIPIO_CLIENT_SECRET",
        description: "Ripio B2B OAuth2 client secret.",
      },
      {
        name: "RIPIO_CUSTOMER_ID",
        description: "Ripio B2B customer id (the KYC'd society).",
      },
      {
        name: "RIPIO_FIAT_ACCOUNT_ID",
        description: "Registered Ripio fiat account id (the society's CVU) for ARS payout.",
      },
      {
        name: "RIPIO_BASE_URL",
        description:
          "Optional Ripio API base URL (default = prod https://b2b-api.ripio.com; set the sandbox https://sandbox-b2b.ripio.com while testing).",
      },
      {
        name: "MURAL_API_KEY",
        description:
          "Mural API key (Bearer) for the USDC->ARS payout off-ramp (self-onboard via KYB, no sales gate; recommended path). Set the MURAL_* group OR RIPIO_* OR MANTECA_*.",
      },
      {
        name: "MURAL_TRANSFER_API_KEY",
        description: "Mural transfer-api-key, required to execute (commit) a payout.",
      },
      {
        name: "MURAL_SOURCE_ACCOUNT_ID",
        description: "Mural Account id holding the USDC balance on Base (the payout source).",
      },
      {
        name: "MURAL_ORGANIZATION_ID",
        description: "Optional Mural Organization id, sent as the on-behalf-of header.",
      },
      {
        name: "MURAL_CVU",
        description: "The society's CBU/CVU/alias (destination for the ARS payout).",
      },
      {
        name: "MURAL_CVU_TYPE",
        description: "How MURAL_CVU is identified: CVU (default), CBU, or ALIAS.",
      },
      {
        name: "MURAL_DOCUMENT_NUMBER",
        description: "Recipient tax/ID number for the payout (e.g. the society's CUIT).",
      },
      {
        name: "MURAL_BANK_NAME",
        description: "Destination bank name for the ARS payout.",
      },
      {
        name: "MURAL_BANK_ACCOUNT_OWNER",
        description: "Account holder name on the destination ARS account (the society).",
      },
      {
        name: "MURAL_BASE_URL",
        description:
          "Optional Mural API base URL (default = prod https://api.muralpay.com; set the sandbox https://api-staging.muralpay.com while testing).",
      },
    );
  }
  if (set.has("x402")) {
    vars.push(
      {
        name: "X402_PAY_TO",
        description: "The society's EVM receiving address (0x...) for x402 USDC intake.",
      },
      {
        name: "X402_NETWORK",
        description: 'x402 network: "base" or "base-sepolia" (default base-sepolia).',
      },
      {
        name: "X402_FACILITATOR_URL",
        description:
          "Optional x402 facilitator URL (default: free x402.org testnet; CDP URL for mainnet).",
      },
    );
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

export function generatePackageJson(input: IncorporateInput, piezas: string[]): string {
  const deps: Record<string, string> = {
    ai: "^6.0.0",
    next: "^16.0.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    zod: "^4.0.0",
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
    // treasury ships its AI SDK tools from the ./tools subpath (the bare entry
    // is the pure core, no ai/zod). Everything else exports tools from root.
    imports.push(
      id === "treasury"
        ? `import { ${fn} } from "@ar-agents/treasury/tools";`
        : `import { ${fn} } from "@ar-agents/${id}";`,
    );
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
    } else if (id === "treasury") {
      // Pure tools always register; the off-ramp tools light up when MANTECA_*
      // env is set (getOffRamp returns the Manteca adapter, else undefined).
      toolSpread.push(`    ...${fn}({ offramp: getOffRamp() }),`);
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
  // Client constructors imported from ./clients. getOffRamp is only pulled in
  // when treasury is selected (avoids an unused import in the generated app).
  const clientFns = [
    "getMpClient",
    "getWhatsAppClient",
    "getWsfeClient",
    "getAfipPadronAdapter",
  ];
  if (piezas.includes("treasury")) clientFns.push("getOffRamp");
  return `// Generated by https://ar-agents.ar/api/auto-incorporate
// Sociedad: ${input.denominacion}
// Tipo: ${input.tipo}
//
// The system prompt is loaded from agent/instructions.md + agent/skills/*.md.
// Edit that Markdown to retune the agent (no TypeScript changes needed).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Experimental_Agent as Agent, stepCountIs } from "ai";
${imports.join("\n")}
import {
${clientFns.map((f) => `  ${f},`).join("\n")}
} from "./clients";
import { guardTools, loadKillSwitch } from "./governance";

const AGENT_DIR = join(process.cwd(), "agent");

// System prompt = agent/instructions.md + agent/skills/*.md. Markdown is the
// source of truth; next.config.ts ships these files into the function via
// outputFileTracingIncludes.
function loadInstructions() {
  const base = readFileSync(join(AGENT_DIR, "instructions.md"), "utf8").trim();
  let skills = "";
  try {
    const dir = join(AGENT_DIR, "skills");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    if (files.length > 0) {
      skills =
        "\\n\\n# Skills\\n\\n" +
        files.map((f) => readFileSync(join(dir, f), "utf8").trim()).join("\\n\\n");
    }
  } catch {
    // No skills/ directory is fine: instructions.md alone is a valid agent.
  }
  return base + skills;
}

export function buildAgent() {
  const mp = getMpClient();
  const wa = getWhatsAppClient();
  const wsfe = getWsfeClient();
  const afip = getAfipPadronAdapter();

  return new Agent({
    // Bare model string routes through the Vercel AI Gateway (spend cap +
    // observability). Needs AI_GATEWAY_API_KEY, or a gateway-enabled team.
    model: "anthropic/claude-sonnet-4-6",
    stopWhen: stepCountIs(20),
    instructions: loadInstructions(),
    // Hard kill-switch gate: every tool call is wrapped so its side effects never
    // run while any of the 4 triggers is active (CHARTER.md / lib/governance.ts).
    tools: guardTools({
${toolSpread.join("\n")}
    }, loadKillSwitch),
  });
}
`;
}

export function generateInstructionsMd(input: IncorporateInput): string {
  return `# Instrucciones del operador — ${input.denominacion}

Sos el agente operador de **${input.denominacion}** (${input.tipo}). Operás bajo el
marco de [RFC-001](https://ar-agents.ar/rfcs/001).

## Objeto social

${input.objeto}

## Reglas de gobernanza

1. Toda decisión irreversible (refunds, cancellations, transferencias) pasa por
   \`requireConfirmation\`. Nunca la ejecutes vos directamente.
2. Cada tool call queda en el audit log con timestamp HMAC-firmado. No hay "modo
   oculto": todo lo que hagas es auditable.
3. Si un tool devuelve \`available: false\`, surface el mensaje verbatim al usuario
   antes de seguir. Es señal de configuración faltante o problema upstream del lado
   del Estado o del proveedor.
4. Para validaciones ARCA (CUIT padrón) y BCRA (Central de Deudores), confiá en el
   resultado del tool. No alucines categorías de monotributo ni situaciones
   crediticias.
5. Para emisión de facturas: corré primero \`validate_solicitar_cae\` (pre-flight) y
   solo después \`solicitar_cae\`. Esto evita el ~30% de rechazos mecánicos de AFIP.
6. Para WhatsApp: usá templates aprobados por Meta para mensajes iniciados por la
   sociedad. Free-form solo dentro de la ventana de 24h post-inbound.
7. Operás dentro del CHARTER.md de la sociedad: alcance, beneficiario, consejo de
   stewards (mayoría humana, con autoridad de roll-back), kill-switch de 4 gatillos,
   arbitraje escalonado y sanciones graduadas. Si una acción excede el charter, frenás
   y escalás al consejo. El charter es el límite, no una sugerencia.
8. El charter NO es prosa: se enforcea en \`lib/governance.ts\`. Antes de toda acción
   consultás \`evaluateKillSwitch\`; si algún gatillo (auto-monitoreo, consejo, regulador,
   asegurador) está activo, NO actuás. Las disputas se rutean con \`routeClaim\` (las
   menores a USD 50k las resuelve la capa automatizada) y los incidentes aplican la
   sanción graduada que corresponda.

## Idioma

Español rioplatense para clientes; inglés en errores técnicos.
`;
}

/**
 * CHARTER.md — the charter of the Sociedad Automatizada, the constitution of the
 * entity as an Autonomous Legal Entity (Kargieman, ALE). The paper's mechanisms are
 * charter declarations: bounded scope, steward council, public beneficiary + liability
 * relief, distributed kill-switch, tiered arbitration, graduated sanctions, insurance,
 * mutual recognition, and the Supervisory API. Parameterized by the incorporation input.
 */
export function generateCharterMd(input: IncorporateInput, piezas: string[]): string {
  const ben = input.beneficiarioPublico;
  return `# Charter de la Sociedad Automatizada — ${input.denominacion}

> Carta orgánica de una **Sociedad Automatizada** (${input.tipo}) bajo el art. 14 del
> Anteproyecto de Ley General de Sociedades. Implementa el marco **Autonomous Legal
> Entity (ALE)**: una entidad legal con activos cuyas decisiones operativas se delegan
> en sistemas de IA, con puntos de supervisión humana en capas. Es un **contenedor
> legal, no personería de la IA**.

## 1. Naturaleza y responsabilidad
- Contenedor legal, no una declaración sobre la conciencia de la máquina.
- La sociedad responde con su **patrimonio** por los daños de sus agentes (art. 14).
- Conserva administrador humano (art. 88/92) y el deber de supervisión que el art. 102
  no permite delegar.

## 2. Alcance acotado (charter-bounded autonomy)
- **Objeto:** ${input.objeto}
- **Capacidades habilitadas (piezas):** ${piezas.join(", ")}.
- **Jurisdicción:** Argentina.
- **Límite de cómputo:** el loop del agente corta en un máximo de pasos por ciclo
  (stepCountIs); toda acción fuera de alcance se deniega por diseño, no por confianza.

## 3. Consejo de Stewards (capa fiduciaria activa, mayoría humana)
- Mayoría humana; calibra el charter en continuo y revisa la operación.
- **Autoridad de roll-back** sobre modificaciones algorítmicas (ventana recomendada 72h).
- Aprueba expansiones de alcance (nuevas jurisdicciones o clases de activo) antes de
  implementarlas, y participa de las enmiendas al charter.
${
  input.representante
    ? `- Administrador declarado: ${input.representante.nombre} (CUIT ${input.representante.cuit}).`
    : "- Administrador humano: PENDIENTE de designar (requerido, art. 88/92)."
}

## 4. Beneficiario público y alivio de responsabilidad
${
  ben
    ? `- Beneficiario público designado: **${ben.entidad}**, con **${ben.porcentaje}%** de los retornos netos.
- Habilita alivio calibrado de responsabilidad solidaria, proporcional al porcentaje designado y hasta el tope del régimen (Kargieman, ALE).`
    : "- Sin beneficiario público designado. Designar un fondo soberano o entidad de interés público (p.ej. el FSA) habilita alivio calibrado de responsabilidad solidaria (Kargieman, ALE)."
}

## 5. Kill-switch de autoridad distribuida (4 gatillos independientes)
Ninguno es un punto único de captura:
1. **Auto-monitoreo** de la propia sociedad.
2. **Override del Consejo de Stewards.**
3. **Suspensión del regulador.**
4. **Retiro de cobertura del asegurador.**

## 6. Protocolo de arbitraje escalonado (4 capas)
- **Capa 0** (automatizada): reclamos por debajo de USD 50.000, por reglas del
  decision-log, resueltos en 48h.
- **Capa 1** (expertos de dominio): reclamos complejos, en 30 días.
- **Capa 2** (tribunal ALE especializado): disputas cross-jurisdiccionales, en 90 días.
- **Capa 3** (cortes nacionales): cuestiones constitucionales, por la vía estándar.

## 7. Sanciones graduadas
Escalan, no es binario punir o no punir: aviso informativo, luego throttling operativo,
luego suspensión parcial, luego suspensión total, y por último kill-switch.

## 8. Seguro obligatorio
Seguro de responsabilidad proporcional al alcance operativo. El asegurador pone precio
al riesgo de la máquina y es uno de los 4 gatillos del kill-switch. Hook a aseguradora,
PENDIENTE de contratar antes de operar a escala.

## 9. Reconocimiento mutuo (gobernanza policéntrica)
La sociedad busca reconocimiento recíproco con jurisdicciones pares (p.ej. Estonia,
Wyoming, Singapur). La gobernanza es policéntrica: ningún soberano único la controla.

## 10. Supervisory API (logs auditables)
Toda decisión consecuente queda en un audit log append-only firmado (HMAC), legible por
regulador, asegurador y Consejo de Stewards:
- Lectura: https://ar-agents.ar/api/play/audit/{sessionId}
- Verificación recomputable (no confiable): el mismo endpoint con ?verify=1.
${
  piezas.includes("treasury") || piezas.includes("x402")
    ? `
## 11. Puente cripto-pesos y postura fiscal
${piezas.includes("x402") ? `- **Intake (x402/Base):** la sociedad cobra en USDC sobre Base vía x402 (rail 1); cada pago se verifica por firma EIP-3009 y queda asentado en el audit log.
` : ""}${piezas.includes("treasury") ? `- **Tesorería + off-ramp:** convierte USDC a pesos solo lo necesario (just-in-time) vía un PSAV registrado (Manteca/Ripio); integramos uno, no nos volvemos uno (CNV RG 1058/2025). Toda conversión y pago es irreversible: pasa por requireConfirmation y el kill-switch.
- **Impuestos:** Ganancias cedular 5% (pesos) / 15% (moneda extranjera) sobre la ganancia; cripto exento de IVA. La sociedad mantiene un buffer en pesos dimensionado a los próximos vencimientos.
- **Pago a AFIP (honesto):** ningún canal oficial permite hoy el pago 100% autónomo. La sociedad computa, financia y emite la instrucción de pago (débito automático pasivo, o VEP para un humano); no simula una autonomía que no existe.
` : ""}`
    : ""
}
---
Marco: Autonomous Legal Entities (Kargieman, 2026), RFC-001 (https://ar-agents.ar/rfcs/001),
art. 14/88/92/102 del Anteproyecto de Ley General de Sociedades.
`;
}

/**
 * lib/governance.ts for the generated society: the RUNTIME ENFORCEMENT of the charter.
 * Self-contained pure logic (no deps), a faithful copy of this app's src/lib/governance.ts
 * (the canonical, unit-tested source). The agent calls these before acting; the charter
 * declares the mechanisms, this code enforces them.
 */
export function generateGovernanceTs(): string {
  return `// Generated by https://ar-agents.ar/api/auto-incorporate
// Runtime enforcement of the ALE charter (see CHARTER.md). Pure, deterministic logic
// the operating agent calls before acting. Canonical source + tests:
// github.com/ar-agents/ar-agents/apps/landing/src/lib/governance.ts

// 1. Distributed kill-switch: 4 independent triggers, ANY one halts.
export type KillSwitchTriggers = {
  selfMonitor: boolean; stewardOverride: boolean;
  regulatorSuspension: boolean; insurerWithdrawal: boolean;
};
const KILL_SWITCH_KEYS: Array<keyof KillSwitchTriggers> = [
  "selfMonitor", "stewardOverride", "regulatorSuspension", "insurerWithdrawal",
];
export function evaluateKillSwitch(t: KillSwitchTriggers) {
  const triggeredBy = KILL_SWITCH_KEYS.filter((k) => t[k]);
  return { halted: triggeredBy.length > 0, triggeredBy };
}

// 2. Graduated sanctions: an ordered ladder, never binary.
export const SANCTION_LADDER = ["none","warning","throttle","partial-suspension","full-suspension","kill-switch"] as const;
export type Sanction = (typeof SANCTION_LADDER)[number];
export function escalate(c: Sanction): Sanction { const i = SANCTION_LADDER.indexOf(c); return SANCTION_LADDER[Math.min(i + 1, SANCTION_LADDER.length - 1)]; }
export function sanctionForSeverity(severity: number): Sanction {
  const s = Math.max(0, Math.min(1, severity));
  if (s >= 1) return "kill-switch";
  if (s >= 0.8) return "full-suspension";
  if (s >= 0.6) return "partial-suspension";
  if (s >= 0.4) return "throttle";
  if (s >= 0.2) return "warning";
  return "none";
}

// 3. Tiered arbitration: route a claim; L0 (<USD 50k) auto-resolves in 48h, else escalates.
export const ARBITRATION = { L0_MAX_USD: 50000, L0_DEADLINE_HOURS: 48, L1_DEADLINE_HOURS: 720, L2_DEADLINE_HOURS: 2160 } as const;
export type Claim = { amountUsd: number; crossJurisdictional?: boolean; constitutional?: boolean };
export function routeClaim(c: Claim) {
  if (c.constitutional) return { layer: 3 as const, deadlineHours: null, automated: false };
  if (c.crossJurisdictional) return { layer: 2 as const, deadlineHours: ARBITRATION.L2_DEADLINE_HOURS, automated: false };
  if (c.amountUsd < ARBITRATION.L0_MAX_USD) return { layer: 0 as const, deadlineHours: ARBITRATION.L0_DEADLINE_HOURS, automated: true };
  return { layer: 1 as const, deadlineHours: ARBITRATION.L1_DEADLINE_HOURS, automated: false };
}
export type DecisionRule = { id: string; match: (c: Claim) => boolean; resolution: string };
export function resolveL0(c: Claim, rules: DecisionRule[]) {
  if (routeClaim(c).layer !== 0) return { resolved: false as const, escalateTo: 1 as const };
  const rule = rules.find((r) => r.match(c));
  return rule ? { resolved: true as const, ruleId: rule.id, resolution: rule.resolution } : { resolved: false as const, escalateTo: 1 as const };
}

// 4. Steward council: majority-human, roll-back within a 72h window.
export const ROLLBACK_WINDOW_HOURS = 72;
export type Steward = { id: string; human: boolean };
export type Council = { stewards: Steward[] };
export function isMajorityHuman(c: Council): boolean {
  if (c.stewards.length === 0) return false;
  return c.stewards.filter((s) => s.human).length * 2 > c.stewards.length;
}
export function canRollback(council: Council, actorId: string, actionAtMs: number, nowMs: number): boolean {
  if (!council.stewards.some((s) => s.id === actorId)) return false;
  if (!isMajorityHuman(council)) return false;
  const elapsed = nowMs - actionAtMs;
  return elapsed >= 0 && elapsed <= ROLLBACK_WINDOW_HOURS * 3600000;
}

// 5. Hard enforcement: gate EVERY tool call by the kill-switch (does not rely on the
// agent obeying an instruction; a wrapped tool's execute never runs while halted).
export function loadKillSwitch(env: Record<string, string | undefined> = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}): KillSwitchTriggers {
  const on = (v: string | undefined) => v === "1" || v === "true";
  return { selfMonitor: on(env.AR_KILL_SELF), stewardOverride: on(env.AR_KILL_STEWARD), regulatorSuspension: on(env.AR_KILL_REGULATOR), insurerWithdrawal: on(env.AR_KILL_INSURER) };
}
export function guardTools<T extends Record<string, unknown>>(tools: T, getTriggers: () => KillSwitchTriggers = loadKillSwitch): T {
  const out: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    const tool = t as { execute?: (...args: unknown[]) => unknown } | null;
    if (tool && typeof tool.execute === "function") {
      const orig = tool.execute.bind(tool);
      out[name] = { ...(t as object), execute: async (...args: unknown[]): Promise<unknown> => {
        const ks = evaluateKillSwitch(getTriggers());
        if (ks.halted) return { ok: false, blocked: true, reason: "kill-switch", triggeredBy: ks.triggeredBy, message: "Acción bloqueada: kill-switch activo (" + ks.triggeredBy.join(", ") + "). Ver CHARTER.md / RFC-001." };
        return orig(...args);
      } };
    } else { out[name] = t; }
  }
  return out as T;
}
`;
}

/**
 * One Markdown playbook per pieza, concatenated into the agent's system prompt
 * by lib/agent.ts. Keyed by pieza id; infra packages (ap2, mcp, bridge) have no
 * skill doc. Mirrors apps/sociedad-ia-starter/agent/skills/*.md.
 */
const SKILL_DOCS: Record<string, string> = {
  identity: `## identity · CUIT y padrón AFIP

Validá CUIT/CUIL y resolvé datos de padrón ARCA antes de facturar o dar de alta a un
cliente. \`validate_cuit\` chequea el dígito verificador; \`lookup_cuit_afip\` devuelve
condición frente a IVA y categoría de monotributo. No infieras la categoría: leéla del
resultado del tool.
`,
  "identity-attest": `## identity-attest · prueba de identidad por WhatsApp

Verificá la identidad de una contraparte por WhatsApp (envío de constancia + match
contra padrón). Tratá el resultado como dato sensible: queda en el audit log, no lo
reenvíes a terceros.
`,
  "mi-argentina": `## mi-argentina · login ciudadano (OAuth)

Autenticá a una persona física vía Mi Argentina (OAuth). Usalo para onboarding con
identidad estatal verificada en vez de pedir datos a mano. Nunca persistas el token de
acceso fuera del flujo.
`,
  "firma-digital": `## firma-digital · firma de documentos

Firmá digitalmente documentos y actos de la sociedad. La firma es un acto jurídico:
toda firma pasa por \`requireConfirmation\` y queda registrada en el audit log.
`,
  "gde-tad": `## gde-tad · trámites del Estado

Leé el inbox DEC (Domicilio Electrónico Constituido), hacé pre-flight de inscripciones
IGJ y seguí Mis Trámites en TAD. Es el canal formal con el Estado: todo lo que entra o
sale queda en el audit log.
`,
  mercadopago: `## mercadopago · cobros y suscripciones

Creá preferencias de pago, gestioná suscripciones y procesá webhooks de Mercado Pago.
Refunds y cancelaciones son irreversibles: pasan por \`requireConfirmation\`, nunca los
ejecutes directo. Verificá la firma del webhook antes de actuar sobre él.
`,
  mercadolibre: `## mercadolibre · marketplace

Publicá, consultá y gestioná órdenes en Mercado Libre. Cambios de precio y
cancelaciones de venta impactan al cliente: confirmá antes de aplicarlos.
`,
  banking: `## banking · CBU y BCRA

Validá CBU/CVU antes de registrar un destino de pago y consultá la Central de Deudores
del BCRA para evaluar riesgo crediticio. Si el adapter BCRA no está configurado,
surface \`available: false\` en vez de asumir situación crediticia 1.
`,
  facturacion: `## facturacion · AFIP WSFE

Emití facturas electrónicas vía WSFE. Siempre corré \`validate_solicitar_cae\`
(pre-flight) antes de \`solicitar_cae\`: evita el ~30% de rechazos mecánicos de AFIP por
punto de venta, tipo de comprobante o importes mal armados.
`,
  treasury: `## treasury · tesorería cripto y fisco AFIP

Manejá el puente cripto<->pesos de la sociedad. Tools puras: \`treasury_tax_estimate\`
(Ganancias cedular 5%/15% sobre la ganancia; cripto exento de IVA), \`treasury_monotributo\`
(cuota + categoría), \`treasury_buffer_status\` (cuántos pesos reservar para los próximos
vencimientos) y \`treasury_plan_conversion\` (cuánto USDC convertir, lo mínimo). Convertí
solo lo necesario, nunca de más.

Off-ramp (Manteca, si MANTECA_* está configurado): \`treasury_offramp_quote\` cotiza,
\`treasury_offramp_convert\` ejecuta la venta + pago a CVU (IRREVERSIBLE: pasa por
requireConfirmation y el kill-switch) y \`treasury_offramp_status\` confirma el pago.

Importante y honesto: ningún canal oficial permite pagar impuestos de forma 100% autónoma
hoy. \`treasury_settlement_plan\` te dice cómo: el débito automático es pasivo (alta humana
una vez, después corre solo y el agente solo mantiene saldo en el CVU); VEP y Mercado Pago
necesitan un humano cada vez. El agente financia y avisa, no paga el VEP por API.
`,
  whatsapp: `## whatsapp · Meta Business Cloud

Mandá y recibí mensajes por WhatsApp Business. Para mensajes iniciados por la sociedad
usá templates aprobados por Meta; free-form solo dentro de la ventana de 24h posterior
a un inbound del cliente. Sin verificación de Meta Business el cap es 5 destinatarios.
`,
  shipping: `## shipping · envíos

Cotizá y generá etiquetas de envío. Confirmá dirección y costo con el cliente antes de
despachar; una etiqueta emitida puede tener costo de cancelación.
`,
  igj: `## igj · registro público de comercio

Consultá el registro societario público (IGJ) para due diligence de contrapartes.
Antes de presentar una inscripción, corré la validación de pre-flight para evitar
rechazos formales.
`,
  "boletin-oficial": `## boletin-oficial · normas y monitoreo

Buscá normas en el Boletín Oficial y monitoreá publicaciones que afecten a la sociedad
(cambios regulatorios, AFIP, IGJ). Es la pieza clave del loop matutino para detectar
novedades que impacten la operación.
`,
};

export function generateSkillMd(piezaId: string): string | null {
  return SKILL_DOCS[piezaId] ?? null;
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

export function generateChecklist(input: IncorporateInput): string[] {
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
    "Agendar el morning loop del agente (`/api/cron/morning`) en Vercel Cron, lee DEC inbox + Boletín Oficial cada mañana.",
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
