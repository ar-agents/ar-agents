// Central risk manifest — the one place that decides which tools may run on
// their own and which need a human to approve them first.
//
// Why this exists: ar-agents tools touch real money (Mercado Pago), real taxes
// (AFIP/ARCA facturación) and real legal acts (incorporating a company). The
// Sociedad Automatizada regime (art. 102) makes a human administrator
// responsible for what the AI does and bars delegating that supervision. So the
// irreversible/financial/legal/fiscal acts MUST pass through a human, and that
// decision cannot live in each agent's own code (an agent could forget it, or a
// third party calling the public MCP would never have it). It lives here, once,
// and `enforceRiskPolicy` applies it to any ToolSet — local agent or MCP server.
//
// Design: a tool's risk is decided by POSITIVE signals (an explicit critical
// override, an `**IRREVERSIBLE**` description flag, or the manifest `sideEffects`
// field) winning over a benign read-name heuristic. Anything we cannot classify
// is `unknown` and FAILS CLOSED (treated as needing approval), so a new or
// forgotten tool can never move money or constitute a company silently.

import type { AnyTool, ToolMiddleware } from "./middleware";
import { applyToAllTools, withApproval } from "./middleware";

/** Risk tiers, lowest to highest stakes. */
export type RiskLevel =
  | "read" // network read, no side effect
  | "create" // creates a low-stakes, reversible resource
  | "money" // moves money
  | "fiscal" // tax act (AFIP/ARCA: facturación, withholdings)
  | "legal" // legal/registry act (incorporation, filings)
  | "irreversible" // cannot be undone
  | "unknown"; // not classifiable -> fail closed

// The art. 102 invariant: these tiers require a human approval before execute.
// `unknown` is included on purpose (fail closed).
const APPROVAL_LEVELS: ReadonlySet<RiskLevel> = new Set<RiskLevel>([
  "money",
  "fiscal",
  "legal",
  "irreversible",
  "unknown",
]);

/** Whether a given risk level demands human approval before the tool runs. */
export function levelRequiresApproval(level: RiskLevel): boolean {
  return APPROVAL_LEVELS.has(level);
}

export interface ToolRiskInput {
  name: string;
  description?: string | undefined;
  /** The `sideEffects` value from a package's tools.manifest.json, if present. */
  sideEffects?: string | undefined;
}

// Explicit overrides for known-critical name patterns. Positive signal: these
// win over the read-name heuristic, so a `get_`-looking name that actually moves
// money or files a tax form is still gated. Small and auditable on purpose.
const OVERRIDES: ReadonlyArray<readonly [RegExp, RiskLevel]> = [
  [/incorporar_sociedad|(^|_)constitu/i, "legal"],
  // Fiscal ACTS only (emit/cancel/file). Tax CALCULATORS (iva/sicore/suss
  // *_calculate) are pure math with no side effect -> they read (see READ_SIGNALS).
  [/emitir_factura|anular_factura|generar_factura|nota_credito|nota_debito|(^|_)cae(_|$)|presentar_(ddjj|f29|f931|declaracion)/i, "fiscal"],
  // Money-MOVING verbs only. "payment" as a noun (get_payment, list_payments)
  // must NOT match here, or reads would be gated; those fall through to read.
  [/transfer|payout|withdraw|reembols|refund|(^|_)cobr|(^|_)depos|(^|_)swap|(^|_)pay(_|$)|(create|cancel|capture|refund|void|process)_payment|charge|checkout|send_money/i, "money"],
  [/(^|_)delete(_|$)|(^|_)remove(_|$)|revoke|destroy|cancel(_|$)/i, "irreversible"],
  // registrar_decision appends to the signed audit log: a write, but low-stakes
  // and the agent should log its own decisions without a human in the loop.
  [/registrar_decision/i, "create"],
];

// Benign read-name patterns. Only consulted when no positive signal fired.
const READ_PATTERNS =
  /^(get|list|search|validate|validar|lookup|consultar|consulta|health|fetch|read|check|is_|describe|info|show|find|status)(_|$)/i;

// Read/compute words that can appear ANYWHERE in a tool name (a calculator, a
// balance lookup, a monetary-variable read). Only consulted after the risk
// overrides + sideEffects, so a genuinely risky name still gates first.
const READ_SIGNALS =
  /(calcula|calcular|calculate|calculo|compute|cotiz|estimat|simul|preview|lookup|consulta|(^|_)info(_|$)|status|balance|saldo|variable|deudas|padron)/i;

function fromSideEffects(se?: string): RiskLevel | null {
  switch ((se ?? "").toLowerCase().trim()) {
    case "irreversible":
      return "irreversible";
    case "moves money":
      return "money";
    case "creates resource":
      return "create";
    case "network read":
    case "none":
      return "read";
    default:
      return null;
  }
}

/** Classify a tool into a {@link RiskLevel}. Positive signals win; unknown fails closed. */
export function classifyTool(input: ToolRiskInput): RiskLevel {
  const name = input.name ?? "";
  // 1. Explicit critical overrides (positive signal beats everything).
  for (const [re, level] of OVERRIDES) {
    if (re.test(name)) return level;
  }
  // 2. Description flag (packages mark irreversible tools as **IRREVERSIBLE**).
  if (input.description && /\bIRREVERSIBLE\b/i.test(input.description)) {
    return "irreversible";
  }
  // 3. Manifest sideEffects hint.
  const se = fromSideEffects(input.sideEffects);
  if (se) return se;
  // 4. Benign read heuristics: anchored read verbs, or read/compute words anywhere.
  if (READ_PATTERNS.test(name) || READ_SIGNALS.test(name)) return "read";
  // 5. Fail closed.
  return "unknown";
}

/** Whether a tool needs a human approval before it may run. */
export function requiresApproval(input: ToolRiskInput): boolean {
  return levelRequiresApproval(classifyTool(input));
}

const identity: ToolMiddleware = (tool) => tool;

export interface EnforceRiskPolicyOptions {
  /**
   * The HITL hook, called BEFORE an approval-level tool runs. Return true to
   * proceed; false (or throw) refuses. This is where the host asks the human
   * administrator, consults a policy engine, or checks an approval token.
   */
  approve: (toolName: string, args: unknown) => Promise<boolean> | boolean;
  /** Supply a tool's manifest `sideEffects` by name to sharpen classification. */
  sideEffectsFor?: (toolName: string) => string | undefined;
  refusedMessage?: string;
}

/**
 * Gate every approval-level tool in a ToolSet behind the `approve` callback;
 * read/create tools pass through untouched. This is the central art. 102
 * enforcement: a caller cannot invoke a money/fiscal/legal/irreversible tool
 * (or an unclassified one) without a human approval, no matter which agent or
 * transport made the call.
 */
export function enforceRiskPolicy<T extends Record<string, AnyTool>>(
  tools: T,
  opts: EnforceRiskPolicyOptions,
): T {
  return applyToAllTools(tools, (name) => {
    const tool = tools[name] as AnyTool | undefined;
    const input: ToolRiskInput = {
      name,
      description:
        typeof tool?.description === "string" ? tool.description : undefined,
      sideEffects: opts.sideEffectsFor?.(name),
    };
    if (!requiresApproval(input)) return identity;
    return withApproval(name, {
      approve: opts.approve,
      refusedMessage:
        opts.refusedMessage ??
        `Tool "${name}" needs human approval (art. 102): ${classifyTool(input)} risk.`,
    });
  });
}
