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
import { applyToAllTools, compose, withApproval, withHalt } from "./middleware";

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
  // Fiscal ACTS only (emit/cancel/file a tax return). Tax CALCULATORS
  // (iva/sicore/suss *_calculate) are pure math with no side effect -> they read
  // (see READ_SIGNALS). DDJJ submissions are matched for any filing verb
  // (presentar/enviar/submit) so sicore_submit_ddjj, suss_submit_ddjj and the
  // iva_*_submit_ddjj tools classify fiscal, not fall through to unknown.
  [/emitir_factura|anular_factura|generar_factura|nota_credito|nota_debito|(^|_)cae(_|$)|(presentar|enviar|submit)_(ddjj|f29|f931|declaracion)/i, "fiscal"],
  // Money-MOVING verbs only. "payment" as a noun (get_payment, list_payments)
  // must NOT match here, or reads would be gated; those fall through to read.
  // `paid_fetch` is the x402 pay-per-call HTTP tool (settles a micropayment);
  // `(accept|reject)_invoice` is the FCE (factura de crédito) act that creates
  // or declines a legally-enforceable payment obligation.
  // Spanish money verbs (pagar/abonar/girar/retirar) are segment-bounded so a
  // read like `list_pagares` (promissory notes) is NOT gated as money — only the
  // verb "pagar", not the noun "pagarés", matches. Closes the gap where a Spanish
  // money verb + a read-ish noun (`pagar_saldo`) downgraded to "read".
  [/transfer|payout|withdraw|reembols|refund|(^|_)cobr|(^|_)depos|(^|_)swap|(^|_)pay(_|$)|(^|_)pagar(_|$)|(^|_)abonar(_|$)|(^|_)girar(_|$)|(^|_)retir(ar|o)?(_|$)|(create|cancel|capture|refund|void|process)_payment|charge|checkout|send_money|paid_fetch|(accept|reject)_invoice/i, "money"],
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

// Mutating verbs that carry a read-ish noun (set_balance, credit_saldo,
// modificar_padron, emitir_padron, presentar_saldo, anular_deudas). READ_SIGNALS
// matches the noun ANYWHERE, so without this a mutation would be downgraded to
// "read" and skip the gate. A name whose verb is here is NOT downgraded: it falls
// through to "unknown" (fail closed) unless an OVERRIDE already caught its true
// category first. This is a denylist, so keep it broad — a false "mutating" only
// costs a needless human approval (safe), while a miss silently skips the gate.
const MUTATING_SIGNALS =
  /(^|_)(set|update|adjust|credit|debit|deduct|increment|decrement|acreditar|debitar|cargar|modificar|actualizar|incrementar|decrementar|write|overwrite|emitir|anular|firmar|aprobar|rechazar|ejecutar|confirmar|suspender|reanudar|presentar|enviar|dar_de_baja|dar_de_alta)(_|$)/i;

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
  // 4. Benign read heuristics: anchored read verbs, or read/compute words
  // anywhere — but NOT when the name also carries a mutating verb (a mutation
  // dressed in a read-ish noun must never be downgraded to "read").
  if (
    (READ_PATTERNS.test(name) || READ_SIGNALS.test(name)) &&
    !MUTATING_SIGNALS.test(name)
  ) {
    return "read";
  }
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
  /**
   * Kill-switch. When provided and it returns true, EVERY tool refuses (the
   * society is suspended), regardless of risk level — checked before the risk
   * gate. The art. 102 supervision duty made operational: a human can halt the
   * whole society, enforced centrally here rather than trusted to each agent.
   * Fails closed (see {@link withHalt}).
   */
  isHalted?: (toolName: string, args: unknown) => Promise<boolean> | boolean;
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
    const riskMw = requiresApproval(input)
      ? withApproval(name, {
          approve: opts.approve,
          refusedMessage:
            opts.refusedMessage ??
            `Tool "${name}" needs human approval (art. 102): ${classifyTool(input)} risk.`,
        })
      : identity;
    // Kill-switch outermost: a suspended society halts EVERY tool (read or not)
    // before the risk gate runs. Same central enforcement point as art. 102.
    if (!opts.isHalted) return riskMw;
    return compose(withHalt(name, { isHalted: opts.isHalted }), riskMw);
  });
}
