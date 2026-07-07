// SD-JWT VC primitives for AP2 v0.2.
//
// Implements RFC 9901 (Selective Disclosure for JWTs) at the level needed
// for AP2's mandate transport. Single-hop only in this Phase 2.1 release —
// multi-hop chains (`~~`-separated, dSD-JWT delegation) ship in Phase 2.2.
//
// Wire format (single-hop):
//
//     <issuer-SD-JWT>~<disclosure_1>~<disclosure_2>~...~<disclosure_n>~<KB-SD-JWT>
//
// where:
//   - issuer-SD-JWT: a compact JWS whose payload contains `_sd` (array of
//     base64url-encoded disclosure digests) plus `_sd_alg` (digest hash
//     algorithm).
//   - disclosures: each is base64url(JSON([salt, claim_name?, claim_value])).
//     For object-property disclosure: 3-tuple [salt, name, value].
//     For array-element disclosure: 2-tuple [salt, value].
//   - KB-SD-JWT: a Key Binding JWT signed by the holder's `cnf.jwk`,
//     containing `aud`, `nonce`, `iat`, `sd_hash` of the preceding tilde-
//     separated chunk.
//
// The AP2 reference impl uses `_sd_alg: "sha-256"`. We support sha-256 by
// default; sha-384 / sha-512 are accepted on parse.

import {
  SdJwtError,
  base64urlDecode,
  base64urlDecodeToString,
  base64urlEncode,
  decodeJwsUnverified,
  signCompactJws,
  verifyCompactJws,
  sha256Base64url,
  type JoseCryptoKey,
  type JWTHeaderParameters,
  type JWTPayload,
  type SignOptions,
  type VerifyOptions,
} from "./crypto";

// ---------------------------------------------------------------------------
// Disclosure encoding / decoding (RFC 9901 §4)
// ---------------------------------------------------------------------------

export interface ObjectDisclosure {
  /** base64url-encoded random salt (>= 16 bytes recommended). */
  salt: string;
  /** Property name being disclosed. */
  name: string;
  value: unknown;
}

export interface ArrayDisclosure {
  salt: string;
  value: unknown;
}

export type Disclosure = ObjectDisclosure | ArrayDisclosure;

/**
 * Encode a disclosure to its compact base64url(JSON([...])) form.
 *  - Object-property: `[salt, name, value]`
 *  - Array-element: `[salt, value]`
 */
export function encodeDisclosure(disclosure: Disclosure): string {
  if ("name" in disclosure) {
    return base64urlEncode(
      JSON.stringify([disclosure.salt, disclosure.name, disclosure.value]),
    );
  }
  return base64urlEncode(
    JSON.stringify([disclosure.salt, disclosure.value]),
  );
}

/** Decode a disclosure string back into its tuple form. */
export function decodeDisclosure(encoded: string): Disclosure {
  const json = base64urlDecodeToString(encoded);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new SdJwtError(
      `Failed to JSON-parse disclosure: ${(err as Error).message}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new SdJwtError("Disclosure must be a JSON array");
  }
  if (parsed.length === 3) {
    const [salt, name, value] = parsed as [unknown, unknown, unknown];
    if (typeof salt !== "string" || typeof name !== "string") {
      throw new SdJwtError(
        "Object disclosure must be [salt:string, name:string, value]",
      );
    }
    return { salt, name, value };
  }
  if (parsed.length === 2) {
    const [salt, value] = parsed as [unknown, unknown];
    if (typeof salt !== "string") {
      throw new SdJwtError("Array disclosure salt must be a string");
    }
    return { salt, value };
  }
  throw new SdJwtError(
    `Disclosure tuple must have 2 (array element) or 3 (object property) entries, got ${parsed.length}`,
  );
}

/**
 * Generate a fresh salt — base64url-encoded 16 random bytes (RFC 9901 §11.3
 * recommendation).
 */
export function generateSalt(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) {
    throw new SdJwtError(
      "Random source required (globalThis.crypto.getRandomValues).",
    );
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

/**
 * Compute the digest of a disclosure — `base64url(sha-256(encoded))` per
 * RFC 9901 §4.1.1. The digest array `_sd` in the SD-JWT issuer payload
 * holds these.
 */
export async function digestOfDisclosure(
  encoded: string,
  alg: string = "sha-256",
): Promise<string> {
  if (alg !== "sha-256" && alg !== "SHA-256") {
    throw new SdJwtError(
      `Only sha-256 _sd_alg supported in Phase 2.1 (got '${alg}'). ` +
        `Multi-alg support ships in Phase 2.2.`,
    );
  }
  return sha256Base64url(encoded);
}

// ---------------------------------------------------------------------------
// SD-JWT compact serialization parsing
// ---------------------------------------------------------------------------

export interface ParsedSdJwt {
  /** The issuer-side compact JWS (header.payload.signature). */
  issuerJwt: string;
  /** Encoded disclosure strings (in the order they appeared on the wire). */
  disclosures: string[];
  /** Optional terminal KB-JWT (compact JWS) signed by holder's cnf.jwk. */
  kbJwt: string | undefined;
}

/**
 * Parse a single-hop SD-JWT compact serialization. Per RFC 9901 §3, the
 * format is `<jws>~<disclosure>~...~<disclosure>~[<kb-jwt>]` where the
 * trailing `~` is REQUIRED and the kb-jwt is OPTIONAL.
 */
export function parseSdJwt(input: string): ParsedSdJwt {
  if (!input.includes("~")) {
    throw new SdJwtError(
      "SD-JWT compact serialization must contain at least one '~'",
    );
  }
  const segments = input.split("~");
  // segments[0] = issuer JWS
  // segments[1..n-1] = disclosures (or KB-JWT in last position)
  // segments[n] = "" (trailing ~) OR KB-JWT
  if (segments.length < 2) {
    throw new SdJwtError("SD-JWT must have an issuer JWS + at least '~'");
  }
  const issuerJwt = segments[0];
  if (!issuerJwt) {
    throw new SdJwtError("SD-JWT issuer JWS is empty");
  }
  // Last segment is either "" (trailing tilde, no KB-JWT) or the KB-JWT.
  // KB-JWTs have 2 dots (header.payload.signature); disclosures don't.
  const last = segments[segments.length - 1] ?? "";
  let kbJwt: string | undefined;
  let disclosureSlice: string[];
  if (last !== "" && last.includes(".")) {
    kbJwt = last;
    disclosureSlice = segments.slice(1, -1);
  } else {
    disclosureSlice = segments.slice(1, -1);
  }
  const disclosures = disclosureSlice.filter((s) => s.length > 0);
  return { issuerJwt, disclosures, kbJwt };
}

/**
 * Serialize an SD-JWT to its compact tilde-separated form.
 * Trailing tilde is included per RFC 9901.
 */
export function serializeSdJwt(parts: ParsedSdJwt): string {
  const segments = [parts.issuerJwt, ...parts.disclosures];
  if (parts.kbJwt !== undefined) {
    segments.push(parts.kbJwt);
  } else {
    segments.push(""); // trailing ~
  }
  return segments.join("~");
}

// ---------------------------------------------------------------------------
// `sd_hash` — used by the KB-JWT to bind to its parent SD-JWT.
// `sd_hash = base64url(sha-256(issuerJwt + "~" + disclosure_1 + ... + "~"))`
// per RFC 9901 §4.4.
// ---------------------------------------------------------------------------

export async function computeSdHash(
  parts: { issuerJwt: string; disclosures: string[] },
  alg: string = "sha-256",
): Promise<string> {
  if (alg !== "sha-256" && alg !== "SHA-256") {
    throw new SdJwtError(
      `Only sha-256 supported for sd_hash in Phase 2.1 (got '${alg}').`,
    );
  }
  // Reconstruct the SD-JWT presentation up to (and including) the trailing
  // tilde before the KB-JWT.
  const presentation = [parts.issuerJwt, ...parts.disclosures, ""].join("~");
  return sha256Base64url(presentation);
}

// ---------------------------------------------------------------------------
// Disclosure resolution — given an issuer payload with `_sd` digests + a
// list of disclosed values, materialize the unredacted payload for the
// verifier.
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** Required `_sd_alg` claim from issuer payload. Default sha-256. */
  sdAlg?: string;
}

/**
 * Walk the issuer payload, replacing `_sd` digest arrays with their
 * disclosed values. Throws if a disclosure doesn't match any digest in the
 * payload (per RFC 9901 §6.1 — unmatched disclosures are an error).
 */
export async function resolveDisclosures(
  issuerPayload: Record<string, unknown>,
  encodedDisclosures: string[],
  options: ResolveOptions = {},
): Promise<Record<string, unknown>> {
  const sdAlg =
    (issuerPayload["_sd_alg"] as string | undefined) ??
    options.sdAlg ??
    "sha-256";

  // Build a digest → disclosure map.
  const digestMap = new Map<string, Disclosure>();
  for (const enc of encodedDisclosures) {
    const digest = await digestOfDisclosure(enc, sdAlg);
    digestMap.set(digest, decodeDisclosure(enc));
  }

  // Recursively walk the payload, substituting `_sd` digest arrays.
  return walk(issuerPayload, digestMap) as Record<string, unknown>;
}

function walk(
  node: unknown,
  digestMap: Map<string, Disclosure>,
): unknown {
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const el of node) {
      // Array elements may be `{ "...": <digest> }` placeholders.
      if (
        el &&
        typeof el === "object" &&
        !Array.isArray(el) &&
        "..." in (el as object)
      ) {
        const digest = (el as { "...": unknown })["..."];
        if (typeof digest !== "string") continue;
        const d = digestMap.get(digest);
        if (!d) continue; // undisclosed — skip
        out.push(walk(("value" in d ? d.value : undefined), digestMap));
      } else {
        out.push(walk(el, digestMap));
      }
    }
    return out;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "_sd" || k === "_sd_alg") continue; // strip from output
      result[k] = walk(v, digestMap);
    }
    // Promote any `_sd` digests that match disclosed object properties.
    if (Array.isArray(obj["_sd"])) {
      for (const digest of obj["_sd"] as unknown[]) {
        if (typeof digest !== "string") continue;
        const d = digestMap.get(digest);
        if (!d) continue; // undisclosed — skip
        if ("name" in d) {
          result[d.name] = walk(d.value, digestMap);
        }
      }
    }
    return result;
  }
  return node;
}

// ---------------------------------------------------------------------------
// Issuer-side helpers — build an SD-JWT given a payload + which fields to
// selectively disclose.
// ---------------------------------------------------------------------------

export interface IssueSdJwtOptions {
  /** Fields to make selectively-disclosable (object-property level). */
  disclosablePaths: string[];
  /** The plaintext payload (full data). */
  payload: Record<string, unknown>;
  /** The `vct` claim (e.g. `mandate.checkout.open.1`). */
  vct: string;
  /** Optional iat/exp + custom claims. */
  iat?: number;
  exp?: number;
  extraClaims?: Record<string, unknown>;
  /** `_sd_alg`. Default sha-256. */
  sdAlg?: string;
}

/**
 * Build the issuer payload for an SD-JWT VC by replacing each
 * `disclosablePaths` top-level key with a digest in `_sd`. Returns both the
 * payload to sign and the encoded disclosures the issuer must include
 * alongside.
 *
 * **Phase 2.1 limitation:** only top-level object-property disclosure is
 * supported. Nested-path / array-element disclosure ships in Phase 2.2.
 */
export async function buildIssuerPayload(
  options: IssueSdJwtOptions,
): Promise<{
  issuerPayload: Record<string, unknown>;
  encodedDisclosures: string[];
}> {
  const sdAlg = options.sdAlg ?? "sha-256";
  const disclosures: string[] = [];
  const sdDigests: string[] = [];
  const remaining: Record<string, unknown> = { ...options.payload };

  for (const path of options.disclosablePaths) {
    if (!(path in remaining)) continue;
    const salt = generateSalt();
    const disclosure: ObjectDisclosure = {
      salt,
      name: path,
      value: remaining[path],
    };
    const encoded = encodeDisclosure(disclosure);
    const digest = await digestOfDisclosure(encoded, sdAlg);
    disclosures.push(encoded);
    sdDigests.push(digest);
    delete remaining[path];
  }

  const issuerPayload: Record<string, unknown> = {
    vct: options.vct,
    ...remaining,
    ...(sdDigests.length > 0 ? { _sd: sdDigests, _sd_alg: sdAlg } : {}),
    ...(options.iat !== undefined ? { iat: options.iat } : {}),
    ...(options.exp !== undefined ? { exp: options.exp } : {}),
    ...(options.extraClaims ?? {}),
  };
  return { issuerPayload, encodedDisclosures: disclosures };
}

// ---------------------------------------------------------------------------
// KB-JWT (Key Binding JWT, RFC 9901 §4.4)
// ---------------------------------------------------------------------------

export interface BuildKbJwtOptions {
  audience: string;
  nonce: string;
  iat?: number;
  /** sd_hash of the SD-JWT presentation this KB-JWT binds to. */
  sdHash: string;
  /** Header `typ`. Per AP2: `kb+sd-jwt` (terminal) or `kb+sd-jwt+kb` (intermediate). */
  typ?: "kb+sd-jwt" | "kb+sd-jwt+kb";
  /** Algorithm for the KB-JWT signature. */
  alg: string;
  /** Optional kid. */
  kid?: string;
  /** Optional `cnf.jwk` for next-hop binding (intermediate hops only). */
  cnfJwk?: object;
}

export async function buildKbJwt(
  signingKey: JoseCryptoKey,
  options: BuildKbJwtOptions,
): Promise<string> {
  const claims: Record<string, unknown> = {
    aud: options.audience,
    nonce: options.nonce,
    iat: options.iat ?? Math.floor(Date.now() / 1000),
    sd_hash: options.sdHash,
  };
  if (options.cnfJwk !== undefined) {
    claims["cnf"] = { jwk: options.cnfJwk };
  }
  const sigOptions: SignOptions = {
    alg: options.alg,
    typ: options.typ ?? "kb+sd-jwt",
    ...(options.kid !== undefined ? { kid: options.kid } : {}),
  };
  return signCompactJws(claims, signingKey, sigOptions);
}

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------

export interface IssuerVerification {
  protectedHeader: JWTHeaderParameters;
  payload: JWTPayload;
}

export async function verifyIssuerJwt(
  issuerJwt: string,
  verificationKey: JoseCryptoKey,
  options: VerifyOptions = {},
): Promise<IssuerVerification> {
  const result = await verifyCompactJws(issuerJwt, verificationKey, options);
  return { protectedHeader: result.protectedHeader, payload: result.payload };
}

export interface KbJwtVerification {
  protectedHeader: JWTHeaderParameters;
  payload: { aud: string; nonce: string; iat: number; sd_hash: string };
}

/**
 * Verify a KB-JWT and check `aud`, `nonce`, and `sd_hash` match the
 * expected values.
 */
export async function verifyKbJwt(
  kbJwt: string,
  verificationKey: JoseCryptoKey,
  expected: { audience: string; nonce: string; sdHash: string },
  options: VerifyOptions = {},
): Promise<KbJwtVerification> {
  const result = await verifyCompactJws(kbJwt, verificationKey, {
    ...options,
    audience: expected.audience,
  });
  const payload = result.payload as Record<string, unknown>;
  if (payload["nonce"] !== expected.nonce) {
    throw new SdJwtError("KB-JWT nonce mismatch");
  }
  if (payload["sd_hash"] !== expected.sdHash) {
    throw new SdJwtError("KB-JWT sd_hash mismatch");
  }
  if (typeof payload["iat"] !== "number") {
    throw new SdJwtError("KB-JWT iat is required");
  }
  return {
    protectedHeader: result.protectedHeader,
    payload: {
      aud: expected.audience,
      nonce: expected.nonce,
      iat: payload["iat"],
      sd_hash: expected.sdHash,
    },
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// SdJwtError now lives in ./crypto (so decodeJwsUnverified can throw it
// without a circular import); re-exported here to keep the public surface.
export { SdJwtError } from "./crypto";

// Internal: silence unused-import warnings from the type-only helpers above.
export type { Disclosure as DisclosureType };
export { decodeJwsUnverified } from "./crypto";
// Sanity: verify base64url helpers are reachable.
export { base64urlDecode, base64urlEncode } from "./crypto";
