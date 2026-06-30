/**
 * GET /api/certifier/cert/{certId}
 *
 * The public, dereferenceable, OFFLINE-verifiable certificate JSON. This is the
 * stable URL a counterparty or a README badge links to. The document carries an
 * Ed25519 signature over canonical006(body) — verify it without trusting this
 * server (`node arg-verify.mjs certificate cert.json`, key at /.well-known/...keys)
 * — and `attestationRef` forwards the subject's own publicly-anchored attestation
 * (the load-bearing trust-minimization per tesis #2).
 *
 * `status` is RECOMPUTED at read: a non-revoked cert past its expiresAt serves as
 * "expired" (we never trust a stale stored status). Revocation is reflected
 * immediately (the stored doc is re-signed at revoke time).
 *
 * Edge runtime. CORS-open so any agent/counterparty can fetch it cross-origin.
 * Cached short — revocation must propagate quickly.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { getCertificate } from "@/lib/certificate";

export const runtime = "edge";

const CERT_ID_RE = /^cert_[a-f0-9]{8,64}$/;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ certId: string }> },
): Promise<Response> {
  const { certId } = await ctx.params;
  if (!CERT_ID_RE.test(certId)) {
    return jsonCors({ error: "invalid_certId" }, { status: 400 });
  }

  const cert = await getCertificate(certId);
  if (!cert) {
    return jsonCors(
      { error: "not_found", note: "No certificate with this id (it may never have been issued)." },
      { status: 404, headers: { "cache-control": "public, max-age=30" } },
    );
  }

  // A revoked or expired cert is still served (it's the authoritative answer a
  // counterparty needs); the status field carries the verdict.
  return jsonCors(cert, {
    headers: {
      "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
    },
  });
}

export async function OPTIONS() {
  return preflight();
}
