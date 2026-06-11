import { jsonCors, preflight } from "@/lib/cors";
import { isSessionIdValid, readAudit } from "@/lib/audit";
import { buildAttestation } from "@/lib/attestation";

/**
 * GET /api/audit/{slug}/bundle: the RFC-006 §8 export bundle, the artifact a
 * regulator or counterparty actually downloads. Self-contained: society,
 * chain links, RFC-004 entries, verification result, and the Ed25519
 * attestation that binds them. Verifiable OFFLINE, end to end:
 *
 *   curl -s https://ar-agents.ar/api/audit/{slug}/bundle > bundle.json
 *   curl -s https://ar-agents.ar/arg-verify.mjs -o arg-verify.mjs
 *   node arg-verify.mjs bundle bundle.json
 *
 * The attestation verifies trust-free (public key). recordsOnly verification
 * of the chain slice additionally needs the operator HMAC secret (RFC-006 is
 * operator-keyed there by design); arg-verify skips it honestly when absent.
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
  const entries = await readAudit(slug);
  const v = res.attestation.body.chain.verification;
  return jsonCors(
    {
      $schema: "https://ar-agents.ar/schemas/export-bundle.v1.json",
      spec: "https://ar-agents.ar/rfcs/006",
      exportedAt: new Date().toISOString(),
      society: { id: slug, slug },
      auditEvents: res.events,
      rfc004Entries: entries,
      ledgerVerification: { valid: v.valid, count: v.count },
      attestation: res.attestation,
      notice:
        "Verifique offline con arg-verify.mjs (node arg-verify.mjs bundle <archivo>). La attestation se verifica con clave publica, sin confiar en este servidor.",
    },
    { headers: { "cache-control": "public, max-age=10, s-maxage=30" } },
  );
}

export async function OPTIONS() {
  return preflight();
}
