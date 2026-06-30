/**
 * POST /api/certifier/revoke
 *
 * Revoke a certificate — the "teeth". Once revoked, the public cert JSON and any
 * ?certId badge flip to "revoked" immediately (the stored doc is re-signed so its
 * signature always matches its current status).
 *
 * Body (JSON): { certId, reason }
 * Auth (owner OR admin — admin is the regulator-grade override):
 *   - x-registry-token: the registry-owner capability token (kind "registry-owner")
 *     for the cert's subject.registryId. The operator can de-certify their own URL.
 *   - x-admin-token (or Authorization: Bearer): the GLOBAL ar-agents operator
 *     secret REGISTRY_ADMIN_TOKEN, compared in constant time. The administrator
 *     can revoke a fraudulent cert WITHOUT the owner token — the regulator-grade
 *     teeth. FAIL-CLOSED: if REGISTRY_ADMIN_TOKEN is unset the admin override is
 *     UNAVAILABLE (a missing secret is never an open door).
 *
 * A cert with no registryId can still be revoked by ADMIN (the override binds to
 * the global secret, not the slug). Owner-token revocation still needs a
 * registryId to bind against; without one and without admin, it fails closed (403).
 *
 * nodejs runtime (token verify + KV write, like the issue + auditor paths).
 */

import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit, kvRateLimit } from "@/lib/ratelimit";
import { verifyCapabilityToken } from "@/lib/capability-token";
import { constantTimeEqual } from "@/lib/incorporate-auth";
import { getCertificate, revokeCertificate } from "@/lib/certificate";

export const runtime = "nodejs";

const REGISTRY_OWNER_KIND = "registry-owner";

/**
 * The GLOBAL ar-agents operator override. Possession of the single env secret
 * REGISTRY_ADMIN_TOKEN authorizes revoking ANY certificate. Constant-time
 * compared; FAIL-CLOSED when the env is unset (override disabled, never open).
 */
async function isRegistryAdmin(req: Request): Promise<boolean> {
  const configured = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  if (!configured) return false; // fail-closed: override disabled when unset
  const presented =
    req.headers.get("x-admin-token")?.trim() ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;
  return constantTimeEqual(presented, configured);
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit("certifier-revoke", ip, 10, 60_000)) {
    return jsonCors({ error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("certifier-revoke", ip, 30, 3600, { failClosed: true }))) {
    return jsonCors({ error: "rate_limited" }, { status: 429 });
  }

  let body: { certId?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonCors({ error: "invalid_json" }, { status: 400 });
  }

  const certId = typeof body.certId === "string" ? body.certId.trim() : "";
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "revoked by issuer";
  if (!certId) return jsonCors({ error: "missing_certId" }, { status: 400 });

  const cert = await getCertificate(certId);
  if (!cert) return jsonCors({ error: "not_found" }, { status: 404 });
  if (cert.status === "revoked") {
    return jsonCors({ error: "already_revoked", certificate: cert }, { status: 409 });
  }

  const registryId = cert.subject.registryId;
  const ownerToken = req.headers.get("x-registry-token")?.trim() ?? "";

  let by: "owner" | "admin" | null = null;
  // ADMIN override first: the global secret authorizes revoking ANY cert,
  // including one with no registryId, WITHOUT the per-entry owner token.
  if (await isRegistryAdmin(req)) {
    by = "admin";
  } else if (ownerToken && registryId) {
    // Owner path needs a registryId to bind the capability token against.
    if (await verifyCapabilityToken(REGISTRY_OWNER_KIND, registryId, ownerToken)) {
      by = "owner";
    }
  }

  if (!by) {
    // Distinguish "you presented nothing" from "what you presented is wrong".
    const hasAdminHeader =
      Boolean(req.headers.get("x-admin-token")?.trim()) ||
      Boolean((req.headers.get("authorization") || "").trim());
    if (!ownerToken && !hasAdminHeader) {
      return jsonCors({ error: "missing_token" }, { status: 401 });
    }
    if (ownerToken && !registryId) {
      return jsonCors(
        { error: "unrevocable", note: "cert has no registryId to authorize an owner token against; admin override required" },
        { status: 403 },
      );
    }
    return jsonCors({ error: "unauthorized" }, { status: 403 });
  }

  const result = await revokeCertificate(certId, reason, by);
  if (!result.ok) {
    if (result.error === "not_found") return jsonCors({ error: "not_found" }, { status: 404 });
    if (result.error === "already_revoked") {
      return jsonCors({ error: "already_revoked" }, { status: 409 });
    }
    return jsonCors({ error: "signing_unavailable" }, { status: 503 });
  }

  return jsonCors(
    { revoked: true, by, certificate: result.certificate },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

export async function OPTIONS() {
  return preflight();
}
