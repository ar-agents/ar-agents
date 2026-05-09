// Scenario presets + governance metadata for the /play demo.
//
// Each tool that the agent can call is classified into one of four
// governance buckets per RFC-001 § 9 — surfacing the classification next to
// every audit-log entry is what makes the demo legible to a regulator.

export type ToolGovernance =
  | "algorithm-only"
  | "audit-logged"
  | "mocked-upstream"
  | "requires-confirmation";

export const GOVERNANCE_LABEL: Record<ToolGovernance, string> = {
  "algorithm-only": "ALGORITMO PURO",
  "audit-logged": "AUDIT-LOGGED",
  "mocked-upstream": "UPSTREAM MOCK",
  "requires-confirmation": "HITL · REQUIERE CONFIRMACIÓN",
};

export const GOVERNANCE_COLOR: Record<
  ToolGovernance,
  { fg: string; bg: string }
> = {
  // Vercel design accents only here, never decoratively.
  "algorithm-only": { fg: "#0a72ef", bg: "#ebf5ff" }, // develop blue
  "audit-logged": { fg: "#7928ca", bg: "#f5edfd" }, // console purple
  "mocked-upstream": { fg: "#666666", bg: "#f5f5f5" }, // gray
  "requires-confirmation": { fg: "#ff5b4f", bg: "#fff1f0" }, // ship red
};

export const AUDIT_TOOL_META: Record<string, { governance: ToolGovernance }> = {
  // identity — algorithm-only, no network
  validate_cuit: { governance: "algorithm-only" },
  validate_cbu: { governance: "algorithm-only" },
  validate_solicitar_cae: { governance: "algorithm-only" },
  validate_igj_inscription: { governance: "algorithm-only" },

  // upstream lookups — mocked in this demo, real in production
  lookup_cuit_afip: { governance: "mocked-upstream" },
  lookup_credit_situation: { governance: "mocked-upstream" },
  get_usd_oficial: { governance: "mocked-upstream" },
  bo_today: { governance: "mocked-upstream" },
  igj_get_entity: { governance: "mocked-upstream" },
  list_domicilio_inbox: { governance: "mocked-upstream" },

  // mutations — audit-logged
  crear_factura: { governance: "audit-logged" },
  send_whatsapp_text: { governance: "audit-logged" },

  // mutations that touch money — would gate on requireConfirmation in prod
  mp_create_subscription: { governance: "audit-logged" },
};

export const SCENARIOS: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: "billing-b2b",
    label: "01 · cobro B2B",
    prompt:
      "Cobrale $75.000 a Acme SRL (CUIT 30-12345678-9). Validá CUIT, consultá padrón, chequeá BCRA. Si está al día, creá la suscripción de MP y mandale el link por WhatsApp al +5491123456789.",
  },
  {
    id: "credit-decision",
    label: "02 · decisión de crédito",
    prompt:
      "Un cliente nuevo me pide cuenta corriente plazo 30 días: CUIT 20-30000005-3, monto $400.000. Decidí si le doy o no, y explicame el razonamiento.",
  },
  {
    id: "morning-loop",
    label: "03 · morning loop",
    prompt:
      "Es la rutina de mañana. Para mi CUIT 30-12345678-9, listá las notificaciones críticas del DEC y las publicaciones del Boletín Oficial de hoy que me afecten. Decime las 3 cosas más urgentes.",
  },
  {
    id: "factura-emit",
    label: "04 · emisión de factura A",
    prompt:
      "Emitime una Factura A para CUIT 30-12345678-9 por $50.000 más IVA al 21%. Antes de mandarla, corré validate_solicitar_cae para verificar que va a pasar el filtro de AFIP.",
  },
  {
    id: "self-incorporate",
    label: "05 · auto-incorporación",
    prompt:
      "Querés constituir una sociedad-IA llamada 'Krap-AI SAS', tipo SOCIEDAD-IA, capital social $1, objeto 'Operación de servicios digitales y desarrollo de software propio para clientes argentinos'. Corré el pre-flight de IGJ y decime qué pasos faltarían.",
  },
];
