/**
 * Authentication for POST /api/auto-incorporate.
 *
 * The endpoint is an irreversible write surface (it appends to the durable
 * audit log and returns a generated scaffold + deploy URL), so it must not be
 * open. This guards it with a shared secret (INCORPORATE_API_KEY), sent as
 * `Authorization: Bearer <key>` or `x-api-key: <key>`, compared in constant
 * time. It FAILS CLOSED: a missing secret is a 500 (misconfiguration), never an
 * open door; a missing or wrong credential is a 401.
 *
 * Edge-safe: uses Web Crypto only (the route runs on `runtime = "edge"`, which
 * has `crypto.subtle` but not `node:crypto`).
 *
 * Preferred upgrade (first-party, no shared secret to rotate): verify the
 * caller's Vercel OIDC JWT here. Callers are Vercel deployments on the same
 * team, so the agent would send `Authorization: Bearer ${VERCEL_OIDC_TOKEN}`
 * and this function would verify the RS256 signature against the JWKS at
 * https://oidc.vercel.com/.well-known/jwks and check the `iss`, `aud`, and
 * team/project (`owner`/`project`) claims (via `jose`'s createRemoteJWKSet +
 * jwtVerify). The Bearer carrier below is already in place for that swap; it is
 * deferred because the agent authenticates with the shared key today and OIDC
 * requires the agent to run on Vercel emitting an OIDC token.
 */

import type { ApproverAttestation } from "./audit";

export type IncorporateAuthResult =
  | { ok: true; approver: ApproverAttestation }
  | { ok: false; status: 401 | 500; error: string };

const encoder = new TextEncoder();

/**
 * Non-secret, stable fingerprint of a credential: `key:<first 16 hex of
 * sha256(secret)>`. Identifies WHICH credential approved an act in the signed
 * audit log without ever storing the secret. Edge-safe (crypto.subtle only).
 */
async function credentialFingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `key:${hex.slice(0, 16)}`;
}

/**
 * Constant-time string comparison on the Edge runtime. HMACs both inputs with a
 * fresh random key and compares the fixed-length digests, so neither the length
 * nor the position of the first mismatch leaks through timing. (`node:crypto`'s
 * timingSafeEqual is unavailable on Edge.)
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [da, db] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/** Extract the presented credential from Authorization: Bearer or x-api-key. */
function presentedCredential(req: Request): string {
  const authz = req.headers.get("authorization");
  const bearer = authz ? authz.replace(/^Bearer\s+/i, "").trim() : "";
  if (bearer) return bearer;
  return req.headers.get("x-api-key")?.trim() ?? "";
}

/**
 * Authorize an incorporation request. Fails closed.
 * - 500 if INCORPORATE_API_KEY is unset (do not allow unauthenticated writes).
 * - 401 if no credential is presented, or it does not match.
 * - ok otherwise.
 */
export async function authorizeIncorporate(req: Request): Promise<IncorporateAuthResult> {
  const key = process.env.INCORPORATE_API_KEY?.trim();
  if (!key) return { ok: false, status: 500, error: "auth_not_configured" };

  const presented = presentedCredential(req);
  if (!presented) return { ok: false, status: 401, error: "unauthorized" };

  const valid = await constantTimeEqual(presented, key);
  if (!valid) return { ok: false, status: 401, error: "unauthorized" };
  // Authenticated: emit the approver attestation that the route binds into the
  // signed audit entry. Today the principal is the credential fingerprint; the
  // OIDC upgrade (see header doc) would swap in the verified subject claim.
  return {
    ok: true,
    approver: {
      method: "shared-key",
      principal: await credentialFingerprint(key),
      principalKind: "credential-fingerprint",
    },
  };
}
