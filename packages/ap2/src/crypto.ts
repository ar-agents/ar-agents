// Crypto layer for AP2.
//
// AP2 v0.2 reference impl uses ES256 (ECDSA P-256 / SHA-256) for every
// signing role. The inner `checkout_jwt` MUST use a non-deterministic scheme
// (per spec — Ed25519 is forbidden because it'd leak no entropy salt for
// rainbow-table defense against `checkout_hash`).
//
// We rely on `jose` for JWS serialization and on WebCrypto under the hood
// (which `jose` also wraps). Edge-Runtime-compatible.

import {
  SignJWT,
  jwtVerify,
  importJWK,
  exportJWK,
  generateKeyPair,
  base64url as joseBase64url,
  type CryptoKey as JoseCryptoKey,
  type JWK as JoseJWK,
  type JWTPayload,
  type JWTHeaderParameters,
  type JWTVerifyResult,
} from "jose";

import type { Jwk } from "./schemas/jwk";

// ---------------------------------------------------------------------------
// Typed error for SD-JWT / JWS handling failures.
//
// Defined here (the lowest-level module) so `decodeJwsUnverified` can raise it
// without a circular import; `sd-jwt.ts` re-exports it, keeping the public
// surface unchanged.
// ---------------------------------------------------------------------------

export class SdJwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SdJwtError";
  }
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

export function base64urlEncode(input: Uint8Array | string): string {
  return joseBase64url.encode(
    typeof input === "string" ? new TextEncoder().encode(input) : input,
  );
}

export function base64urlDecode(input: string): Uint8Array {
  return joseBase64url.decode(input);
}

export function base64urlDecodeToString(input: string): string {
  return new TextDecoder().decode(joseBase64url.decode(input));
}

// ---------------------------------------------------------------------------
// SHA-256 → base64url. Used for `sd_hash` and `checkout_hash`.
// ---------------------------------------------------------------------------

export async function sha256(input: string | Uint8Array): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const data =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await subtle.digest("SHA-256", data as BufferSource);
  return new Uint8Array(digest);
}

export async function sha256Base64url(
  input: string | Uint8Array,
): Promise<string> {
  return base64urlEncode(await sha256(input));
}

// ---------------------------------------------------------------------------
// Key generation + JWK conversion
// ---------------------------------------------------------------------------

/** AP2 algorithm choices. ES256 is the canonical reference. */
export const AP2_ALGS = ["ES256", "ES384", "ES512", "RS256", "EdDSA"] as const;
export type Ap2Alg = (typeof AP2_ALGS)[number];

/** ES256 / ES384 / ES512 are the canonical "non-deterministic" schemes
 *  AP2 mandates for the inner `checkout_jwt`. EdDSA is forbidden there. */
export const NON_DETERMINISTIC_ALGS = ["ES256", "ES384", "ES512"] as const;

export interface Ap2KeyPair {
  /** The signing private key (jose CryptoKey reference). */
  privateKey: JoseCryptoKey;
  /** The verification public key. */
  publicKey: JoseCryptoKey;
  /** Public JWK (suitable for `cnf.jwk`, JWKS, etc.). */
  publicJwk: Jwk;
  /** The algorithm bound to this key. */
  alg: Ap2Alg;
}

/**
 * Generate a fresh keypair for AP2 signing. Defaults to ES256 (the canonical
 * spec algorithm). Returns CryptoKey handles + a public JWK ready to use as
 * `cnf.jwk`.
 */
export async function generateAp2KeyPair(
  alg: Ap2Alg = "ES256",
): Promise<Ap2KeyPair> {
  const { privateKey, publicKey } = await generateKeyPair(alg, {
    extractable: true,
  });
  const publicJwk = (await exportJWK(publicKey)) as Jwk;
  return { privateKey, publicKey, publicJwk, alg };
}

/** Resolve a `cnf.jwk` to a verification key. */
export async function importPublicJwk(
  jwk: Jwk,
  alg: string,
): Promise<JoseCryptoKey> {
  return (await importJWK(jwk as unknown as JoseJWK, alg)) as JoseCryptoKey;
}

/** Resolve a private JWK (with `d`) to a signing key. */
export async function importPrivateJwk(
  jwk: Jwk & { d: string },
  alg: string,
): Promise<JoseCryptoKey> {
  return (await importJWK(jwk as unknown as JoseJWK, alg)) as JoseCryptoKey;
}

// ---------------------------------------------------------------------------
// JWS sign / verify (compact serialization)
// ---------------------------------------------------------------------------

export interface SignOptions {
  alg: string;
  /** Header `typ`. AP2 uses several values: `JWT` (inner checkout_jwt),
   *  `dc+sd-jwt` (DC-API SD-JWT VC), `example+sd-jwt` (issuer SD-JWT),
   *  `kb+sd-jwt` (terminal KB-JWT), `kb+sd-jwt+kb` (intermediate). */
  typ?: string;
  /** Optional key id reference. */
  kid?: string;
  /** Optional cert chain for `x5c` validation. */
  x5c?: string[];
}

/**
 * Sign an arbitrary JSON payload using ES256 (or another configured alg) as a
 * compact JWS. Used for the inner `checkout_jwt`, KB-JWTs, and receipts.
 *
 * **Spec-critical:** if `payload` is a checkout payload destined for the
 * inner `checkout_jwt`, `options.alg` MUST be in `NON_DETERMINISTIC_ALGS`.
 * Use `signCheckoutJwt()` (in `checkout-jwt.ts`) for that path — it enforces
 * the rule at construction time.
 */
export async function signCompactJws(
  payload: JWTPayload,
  signingKey: JoseCryptoKey,
  options: SignOptions,
): Promise<string> {
  const protectedHeader: JWTHeaderParameters = {
    alg: options.alg,
    ...(options.typ !== undefined ? { typ: options.typ } : {}),
    ...(options.kid !== undefined ? { kid: options.kid } : {}),
    ...(options.x5c !== undefined ? { x5c: options.x5c } : {}),
  };
  return new SignJWT(payload).setProtectedHeader(protectedHeader).sign(signingKey);
}

export interface VerifyOptions {
  /** Acceptable algorithms. Default: AP2_ALGS. */
  algorithms?: string[];
  /** Expected audience. Validated against `aud` claim if set. */
  audience?: string;
  /** Expected issuer. Validated against `iss` claim if set. */
  issuer?: string;
  /** Clock skew in seconds for iat/exp validation. Default 30. */
  clockTolerance?: number;
  /** Override "now" for deterministic tests. Unix seconds. */
  currentDate?: Date;
}

/**
 * Verify a compact JWS, returning the parsed payload + protected header.
 * Throws on signature failure / time-claim violation / aud-iss mismatch.
 */
export async function verifyCompactJws(
  jws: string,
  verificationKey: JoseCryptoKey,
  options: VerifyOptions = {},
): Promise<JWTVerifyResult> {
  const verifyOpts: Parameters<typeof jwtVerify>[2] = {
    algorithms: options.algorithms ?? [...AP2_ALGS],
    clockTolerance: options.clockTolerance ?? 30,
    ...(options.audience !== undefined ? { audience: options.audience } : {}),
    ...(options.issuer !== undefined ? { issuer: options.issuer } : {}),
    ...(options.currentDate !== undefined
      ? { currentDate: options.currentDate }
      : {}),
  };
  return jwtVerify(jws, verificationKey, verifyOpts);
}

// ---------------------------------------------------------------------------
// JWS parsing without verification — used by the SD-JWT layer to read the
// header before resolving keys.
// ---------------------------------------------------------------------------

export interface DecodedJws {
  protectedHeader: JWTHeaderParameters;
  payload: JWTPayload;
  signature: string;
}

export function decodeJwsUnverified(jws: string): DecodedJws {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    throw new Error(
      `Compact JWS must have 3 parts (header.payload.signature), got ${parts.length}`,
    );
  }
  const [headerB64, payloadB64, signature] = parts as [string, string, string];
  // The header and payload are attacker-controlled input: a malformed
  // base64url segment or non-JSON content must surface as the package's typed
  // error, not a raw SyntaxError.
  let protectedHeader: JWTHeaderParameters;
  try {
    protectedHeader = JSON.parse(
      base64urlDecodeToString(headerB64),
    ) as JWTHeaderParameters;
  } catch {
    throw new SdJwtError("malformed JWS: protected header is not valid base64url-encoded JSON");
  }
  let payload: JWTPayload;
  try {
    payload = JSON.parse(base64urlDecodeToString(payloadB64)) as JWTPayload;
  } catch {
    throw new SdJwtError("malformed JWS: payload is not valid base64url-encoded JSON");
  }
  return { protectedHeader, payload, signature };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getSubtleCrypto(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error(
      "WebCrypto API is required (globalThis.crypto.subtle). " +
        "Available in Node 20+, browsers, Vercel Edge, Cloudflare Workers, Deno, Bun.",
    );
  }
  return c.subtle;
}

// Re-export jose types consumers may need.
export type {
  JWTPayload,
  JWTHeaderParameters,
  JWTVerifyResult,
} from "jose";
export type { CryptoKey as JoseCryptoKey } from "jose";
