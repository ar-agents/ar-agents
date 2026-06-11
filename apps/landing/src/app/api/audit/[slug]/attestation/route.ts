import { jsonCors, preflight } from "@/lib/cors";
import { isSessionIdValid } from "@/lib/audit";
import { buildAttestation } from "@/lib/attestation";

/**
 * GET /api/audit/{slug}/attestation: Ed25519-signed compliance attestation
 * for one society's slice of the RFC-006 ledger. Verifiable OFFLINE with the
 * independent verifier, no secret and no trust in this server:
 *
 *   curl -s https://ar-agents.ar/api/audit/{slug}/attestation > att.json
 *   curl -s https://ar-agents.ar/arg-verify.mjs -o arg-verify.mjs
 *   node arg-verify.mjs attestation att.json
 */

export const runtime = "edge";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isSessionIdValid(slug)) {
    return jsonCors({ error: "invalid_slug" }, { status: 400 });
  }
  const res = await buildAttestation(slug);
  if (!res) {
    return jsonCors(
      { error: "not_available", note: "ledger vacío o claves sin configurar" },
      { status: 503 },
    );
  }
  return jsonCors(res.attestation, {
    headers: { "cache-control": "public, max-age=10, s-maxage=30" },
  });
}

export async function OPTIONS() {
  return preflight();
}
