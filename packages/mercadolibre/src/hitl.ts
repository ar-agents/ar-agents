// Human-in-the-loop (HITL) gate for irreversible operations.
//
// Eight tool functions in `meliTools()` mutate seller-visible state in ways
// that are hard to reverse:
//
//   create_item                 — emits a public listing
//   update_item_price_or_stock  — public price change (visible immediately)
//   answer_question             — public answer on the listing page
//   defend_claim                — uploads evidence (one-shot, no amendment)
//   optInPromotion              — locks the discount until promo expires
//   blacklistAsker              — silences a buyer permanently
//   pauseItem / closeItem       — affects discoverability + indexing
//
// Stripe Agent Toolkit's HITL pattern, applied to MELI. The host wires a
// `requireConfirmation` callback that the lib invokes BEFORE the HTTP call
// fires. The callback returns `true` to proceed, `false` to abort. The
// guard is PROGRAMMATIC — it's not just a system-prompt rule the LLM might
// ignore; the tool literally cannot execute without confirmation.
//
// Use cases:
//   - Show the user a UI ("approve $X price change on MLA…?") and wait.
//   - Auto-approve below a threshold ("any change <5% is fine").
//   - Email/Slack the seller before destructive ops in a multi-tenant SaaS.
//   - Audit logging — every irreversible op gets logged with the operator id.

/** Operations the HITL gate covers. Stable identifiers — host code can
 *  switch on these to render different UIs ("you're about to defend claim
 *  X with N evidences" vs "you're about to change the price of Y"). */
export type HitlOpKind =
  | "create_item"
  | "update_item_price_or_stock"
  | "pause_item"
  | "close_item"
  | "relist_item"
  | "answer_question"
  | "defend_claim"
  | "opt_in_promotion"
  | "blacklist_asker";

/** Common envelope across all op kinds. Tool implementations wrap their
 *  inputs into this shape before invoking the gate. */
export interface HitlContext<TKind extends HitlOpKind = HitlOpKind> {
  kind: TKind;
  /** Stable identifier for the resource being mutated (item id, claim id,
   *  question id, etc.) so the host UI can render a recognizable target. */
  resourceId: string | number;
  /** Human-readable summary the host can show the user without parsing the
   *  raw input. Always Spanish — these go in front of Argentine sellers. */
  summary: string;
  /** Raw inputs the tool received, for advanced UIs that want to render a
   *  diff or full preview. Don't rely on the shape — it's per-op. */
  input: unknown;
  /** Best-effort severity hint. Hosts can use this to decide whether to
   *  block + ask vs auto-approve via threshold rules. */
  severity: "low" | "medium" | "high";
}

/**
 * Decision returned from the host's HITL callback.
 *
 *   - `{ approve: true }`            — proceed with the operation.
 *   - `{ approve: false, reason }`   — abort. The tool returns
 *                                      `{ ok: false, code: "hitl_rejected" }`.
 *   - `{ approve: true, override: { ... } }` — proceed BUT replace the
 *                                              tool's inputs (e.g., user
 *                                              hand-edited the answer text
 *                                              before approving).
 */
export type HitlDecision =
  | { approve: true; override?: Record<string, unknown> }
  | { approve: false; reason?: string };

/** Sync or async — hosts often need to render a UI + await a click. */
export type RequireConfirmation = (
  context: HitlContext,
) => HitlDecision | Promise<HitlDecision>;

/**
 * Auto-approve hook. Lets the host run a fast policy decision before
 * popping a UI dialog. Examples:
 *   - "any update under 5% price delta auto-approves"
 *   - "any answer under 200 chars auto-approves"
 *   - "create_item never auto-approves; always ask"
 */
export type AutoApprovePolicy = (
  context: HitlContext,
) => boolean | Promise<boolean>;

/** Default policy — never auto-approves. Forces every irreversible op
 *  through the user. Hosts override via `meliTools(client, { hitl })`. */
export const denyAllAutoApprove: AutoApprovePolicy = () => false;

/** Combined HITL configuration the AI-SDK toolset accepts. */
export interface HitlConfig {
  /** Required. Called to gate every op the auto-approve policy didn't pass. */
  requireConfirmation: RequireConfirmation;
  /** Optional. Bypasses `requireConfirmation` when it returns true. */
  autoApprove?: AutoApprovePolicy;
}

/** Internal helper used by the AI-SDK tool wrappers. Returns the (possibly
 *  overridden) inputs if the op is approved, or throws `HitlRejectedError`
 *  if rejected. */
export class HitlRejectedError extends Error {
  readonly code = "hitl_rejected";
  constructor(
    public readonly context: HitlContext,
    public readonly reason?: string,
  ) {
    super(
      reason
        ? `HITL: rejected by user (${context.kind} on ${context.resourceId}): ${reason}`
        : `HITL: rejected by user (${context.kind} on ${context.resourceId})`,
    );
    this.name = "HitlRejectedError";
  }
}

export async function gateHitl(
  hitl: HitlConfig | undefined,
  context: HitlContext,
): Promise<{ approved: true; overrides?: Record<string, unknown> }> {
  if (!hitl) return { approved: true };
  const auto = hitl.autoApprove ?? denyAllAutoApprove;
  if (await auto(context)) return { approved: true };
  const decision = await hitl.requireConfirmation(context);
  if (decision.approve === false) {
    throw new HitlRejectedError(context, decision.reason);
  }
  if (decision.override !== undefined) {
    return { approved: true, overrides: decision.override };
  }
  return { approved: true };
}

/** Severity classifier. Used by tool wrappers when building the context. */
export function classifyHitlSeverity(kind: HitlOpKind): HitlContext["severity"] {
  switch (kind) {
    case "create_item":
    case "defend_claim":
    case "opt_in_promotion":
      return "high"; // hard to undo
    case "update_item_price_or_stock":
    case "pause_item":
    case "close_item":
    case "blacklist_asker":
      return "medium"; // reversible but visible
    case "relist_item":
    case "answer_question":
      return "low"; // small blast radius
  }
}
