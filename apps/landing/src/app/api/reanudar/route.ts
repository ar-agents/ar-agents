/**
 * `POST /api/reanudar`, lift the kill-switch. The administrator resumes a
 * suspended society (same CUIT-match authorization, recorded as a signed
 * durable audit act). After this the society's agent can act again.
 */

import { preflight } from "@/lib/cors";
import { handleSuspensionRequest } from "@/lib/suspension";

export const runtime = "edge";

export async function POST(req: Request) {
  return handleSuspensionRequest(req, false);
}

export async function OPTIONS() {
  return preflight();
}
