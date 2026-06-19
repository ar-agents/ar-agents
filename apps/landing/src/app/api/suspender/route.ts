/**
 * `POST /api/suspender`, the kill-switch trigger.
 *
 * The administrator suspends their Sociedad Automatizada (art. 102 supervision
 * duty, made operational). Authorized by matching the caller's CUIT against the
 * administrator in the society's signed constitution, recorded as a signed
 * durable audit act, then flipped in the suspension set. While suspended, the
 * society's agent halts every tool (central enforcement, see @ar-agents/core
 * withHalt / enforceRiskPolicy isHalted).
 */

import { preflight } from "@/lib/cors";
import { handleSuspensionRequest } from "@/lib/suspension";

export const runtime = "edge";

export async function POST(req: Request) {
  return handleSuspensionRequest(req, true);
}

export async function OPTIONS() {
  return preflight();
}
