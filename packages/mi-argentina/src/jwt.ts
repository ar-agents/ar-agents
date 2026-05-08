/**
 * Minimal JWT verifier for OIDC ID tokens. Uses Web Crypto only — works on
 * Edge Runtime, Cloudflare Workers, Deno, browsers.
 *
 * # Scope
 *
 * - RS256 (RSA-PKCS1-v1_5 + SHA-256), the algorithm Mi Argentina (and the
 *   vast majority of OIDC providers) signs ID tokens with.
 * - JWKS resolution by `kid`.
 * - Standard claim checks: iss, aud, exp, iat, nonce.
 * - 60-second clock skew tolerance.
 *
 * Out of scope: ES256, EdDSA, encrypted JWE, custom claim processors. Keep
 * the verifier small and predictable; richer ones (jose, jsonwebtoken) are
 * available if needed.
 */

import { IdTokenInvalidError } from "./errors";
import { base64UrlDecode } from "./pkce";
import type { VerifiedIdToken } from "./types";

/** RFC 7517 JSON Web Key (RSA only — what Mi Argentina uses). */
export interface RsaJwk {
  kty: "RSA";
  kid: string;
  alg?: "RS256";
  use?: "sig";
  n: string;
  e: string;
}

export interface JwksDocument {
  keys: RsaJwk[];
}

export interface VerifyOptions {
  expectedIssuer: string;
  expectedAudience: string;
  /** Required when ID token contains a `nonce` claim. */
  expectedNonce?: string;
  /** Clock skew tolerance in seconds. Default 60. */
  skewSeconds?: number;
  /** Override the wall-clock for tests. Returns seconds since epoch. */
  now?: () => number;
}

interface JwtParts {
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
  signature: Uint8Array;
  signedInput: Uint8Array;
}

/**
 * Decode a JWT into its three parts WITHOUT verifying the signature.
 *
 * USE FOR INSPECTION ONLY. Never trust claims from this function — call
 * `verifyIdToken()` for any real authn/authz decision.
 */
export function decodeJwt(jwt: string): JwtParts {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new IdTokenInvalidError("not a compact JWT (expected 3 parts)");
  }
  const [headerB64, claimsB64, sigB64] = parts as [string, string, string];
  const decoder = new TextDecoder();
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(decoder.decode(base64UrlDecode(headerB64)));
    claims = JSON.parse(decoder.decode(base64UrlDecode(claimsB64)));
  } catch {
    throw new IdTokenInvalidError("malformed JWT (header or claims not JSON)");
  }
  return {
    header,
    claims,
    signature: base64UrlDecode(sigB64),
    signedInput: new TextEncoder().encode(`${headerB64}.${claimsB64}`),
  };
}

/**
 * Verify an OIDC ID token end-to-end:
 *   1. Decode header + claims.
 *   2. Locate the signing key by `kid`.
 *   3. Verify RS256 signature.
 *   4. Check issuer, audience, expiration, nonce.
 *
 * Throws `IdTokenInvalidError` on any failure. Returns the verified header
 * + claims on success.
 */
export async function verifyIdToken(
  jwt: string,
  jwks: JwksDocument,
  options: VerifyOptions,
): Promise<VerifiedIdToken> {
  const parts = decodeJwt(jwt);

  const alg = parts.header["alg"];
  if (alg !== "RS256") {
    throw new IdTokenInvalidError(`unsupported alg "${String(alg)}"; only RS256 is supported`);
  }
  const kid = parts.header["kid"];
  if (typeof kid !== "string" || kid.length === 0) {
    throw new IdTokenInvalidError("ID token header missing kid");
  }
  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) {
    throw new IdTokenInvalidError(`no JWKS key matches kid "${kid}" — JWKS may be stale, refresh and retry`);
  }
  if (jwk.kty !== "RSA") {
    throw new IdTokenInvalidError(`JWKS key type "${jwk.kty}" not supported (RSA only)`);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk as unknown as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // Copy into fresh ArrayBuffer-backed views — Web Crypto's TS types reject
  // SharedArrayBuffer-backed Uint8Arrays even though the runtime accepts them.
  const sigBuf = parts.signature.buffer.slice(
    parts.signature.byteOffset,
    parts.signature.byteOffset + parts.signature.byteLength,
  ) as ArrayBuffer;
  const inputBuf = parts.signedInput.buffer.slice(
    parts.signedInput.byteOffset,
    parts.signedInput.byteOffset + parts.signedInput.byteLength,
  ) as ArrayBuffer;
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    sigBuf,
    inputBuf,
  );
  if (!valid) {
    throw new IdTokenInvalidError("signature verification failed");
  }

  const claims = parts.claims;
  const now = options.now ? options.now() : Math.floor(Date.now() / 1000);
  const skew = options.skewSeconds ?? 60;

  if (claims["iss"] !== options.expectedIssuer) {
    throw new IdTokenInvalidError(
      `issuer mismatch: expected "${options.expectedIssuer}", got "${String(claims["iss"])}"`,
    );
  }
  const aud = claims["aud"];
  const audMatch = Array.isArray(aud)
    ? aud.includes(options.expectedAudience)
    : aud === options.expectedAudience;
  if (!audMatch) {
    throw new IdTokenInvalidError(
      `audience mismatch: expected "${options.expectedAudience}", got "${JSON.stringify(aud)}"`,
    );
  }
  const exp = claims["exp"];
  if (typeof exp !== "number" || exp + skew < now) {
    throw new IdTokenInvalidError(`token expired (exp=${String(exp)}, now=${now})`);
  }
  const iat = claims["iat"];
  if (typeof iat !== "number" || iat - skew > now) {
    throw new IdTokenInvalidError(`token iat in the future (iat=${String(iat)}, now=${now})`);
  }
  if (options.expectedNonce !== undefined) {
    if (claims["nonce"] !== options.expectedNonce) {
      throw new IdTokenInvalidError(
        `nonce mismatch: expected "${options.expectedNonce}", got "${String(claims["nonce"])}"`,
      );
    }
  }

  return {
    header: parts.header as VerifiedIdToken["header"],
    claims: claims as VerifiedIdToken["claims"],
  };
}
