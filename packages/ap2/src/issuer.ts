// Single-hop AP2 mandate issuer.
//
// Builds well-formed SD-JWT VC presentations for each of the four mandate
// types in AP2 v0.2. Phase 2.1 ships single-hop only — multi-hop chains
// (`~~`-separated, dSD-JWT delegation) are Phase 2.2.
//
// Caller flow (Direct / Trusted Surface model):
//
//   1. Generate or load a signing keypair (ES256 / RS256, NOT Ed25519 for
//      checkout_jwt).
//   2. Build the inner `checkout_jwt` (only for Closed Checkout Mandates) via
//      `signCheckoutJwt`.
//   3. Call `issueClosedCheckoutMandate` (or any of the 3 sibling builders).
//   4. Receive a compact SD-JWT presentation string ready to send on the wire.

import {
  signCompactJws,
  type JoseCryptoKey,
} from "./crypto";
import {
  buildIssuerPayload,
  buildKbJwt,
  computeSdHash,
  serializeSdJwt,
  type ParsedSdJwt,
} from "./sd-jwt";
import type {
  ClosedCheckoutMandate,
  OpenCheckoutMandate,
} from "./schemas/checkout-mandate";
import type {
  ClosedPaymentMandate,
  OpenPaymentMandate,
} from "./schemas/payment-mandate";

// ---------------------------------------------------------------------------
// Common shape for issuance
// ---------------------------------------------------------------------------

export interface IssuerSigningCtx {
  /** Issuer's signing key (JWS root). */
  privateKey: JoseCryptoKey;
  /** JWS algorithm (ES256 default). */
  alg: string;
  /** Header `kid` (optional). */
  kid?: string;
  /** Header `typ` for the issuer JWS. Default `example+sd-jwt`. */
  typ?: string;
}

export interface KeyBindingCtx {
  /** Holder's signing key for the KB-JWT (matching `cnf.jwk`). */
  privateKey: JoseCryptoKey;
  /** Algorithm. ES256 default. */
  alg: string;
  /** Optional kid. */
  kid?: string;
  /** Audience the KB-JWT binds to ("merchant" / "credential-provider" / etc.). */
  audience: string;
  /** Verifier-supplied nonce. */
  nonce: string;
}

export interface IssueOpenCheckoutOptions {
  mandate: OpenCheckoutMandate;
  signingCtx: IssuerSigningCtx;
  /** Optional Key Binding hop. If set, the SD-JWT terminates with a KB-JWT. */
  keyBinding?: KeyBindingCtx;
  /** Override sd_alg. Default sha-256. */
  sdAlg?: string;
}

export async function issueOpenCheckoutMandate(
  options: IssueOpenCheckoutOptions,
): Promise<string> {
  const { issuerPayload, encodedDisclosures } = await buildIssuerPayload({
    payload: { ...options.mandate },
    disclosablePaths: ["constraints"],
    vct: options.mandate.vct,
    sdAlg: options.sdAlg ?? "sha-256",
  });
  const issuerJwt = await signCompactJws(issuerPayload, options.signingCtx.privateKey, {
    alg: options.signingCtx.alg,
    typ: options.signingCtx.typ ?? "example+sd-jwt",
    ...(options.signingCtx.kid !== undefined ? { kid: options.signingCtx.kid } : {}),
  });
  return assemble({
    issuerJwt,
    disclosures: encodedDisclosures,
    ...(options.keyBinding !== undefined ? { keyBinding: options.keyBinding } : {}),
  });
}

export interface IssueClosedCheckoutOptions {
  mandate: ClosedCheckoutMandate;
  signingCtx: IssuerSigningCtx;
  keyBinding?: KeyBindingCtx;
  sdAlg?: string;
}

export async function issueClosedCheckoutMandate(
  options: IssueClosedCheckoutOptions,
): Promise<string> {
  const { issuerPayload, encodedDisclosures } = await buildIssuerPayload({
    payload: { ...options.mandate },
    // checkout_jwt is the heaviest field; make it selectively-disclosable.
    disclosablePaths: ["checkout_jwt"],
    vct: options.mandate.vct,
    sdAlg: options.sdAlg ?? "sha-256",
  });
  const issuerJwt = await signCompactJws(issuerPayload, options.signingCtx.privateKey, {
    alg: options.signingCtx.alg,
    typ: options.signingCtx.typ ?? "example+sd-jwt",
    ...(options.signingCtx.kid !== undefined ? { kid: options.signingCtx.kid } : {}),
  });
  return assemble({
    issuerJwt,
    disclosures: encodedDisclosures,
    ...(options.keyBinding !== undefined ? { keyBinding: options.keyBinding } : {}),
  });
}

export interface IssueOpenPaymentOptions {
  mandate: OpenPaymentMandate;
  signingCtx: IssuerSigningCtx;
  keyBinding?: KeyBindingCtx;
  sdAlg?: string;
}

export async function issueOpenPaymentMandate(
  options: IssueOpenPaymentOptions,
): Promise<string> {
  const { issuerPayload, encodedDisclosures } = await buildIssuerPayload({
    payload: { ...options.mandate },
    disclosablePaths: ["constraints"],
    vct: options.mandate.vct,
    sdAlg: options.sdAlg ?? "sha-256",
  });
  const issuerJwt = await signCompactJws(issuerPayload, options.signingCtx.privateKey, {
    alg: options.signingCtx.alg,
    typ: options.signingCtx.typ ?? "example+sd-jwt",
    ...(options.signingCtx.kid !== undefined ? { kid: options.signingCtx.kid } : {}),
  });
  return assemble({
    issuerJwt,
    disclosures: encodedDisclosures,
    ...(options.keyBinding !== undefined ? { keyBinding: options.keyBinding } : {}),
  });
}

export interface IssueClosedPaymentOptions {
  mandate: ClosedPaymentMandate;
  signingCtx: IssuerSigningCtx;
  keyBinding?: KeyBindingCtx;
  sdAlg?: string;
}

export async function issueClosedPaymentMandate(
  options: IssueClosedPaymentOptions,
): Promise<string> {
  const { issuerPayload, encodedDisclosures } = await buildIssuerPayload({
    payload: { ...options.mandate },
    disclosablePaths: ["payment_amount", "payment_instrument"],
    vct: options.mandate.vct,
    sdAlg: options.sdAlg ?? "sha-256",
  });
  const issuerJwt = await signCompactJws(issuerPayload, options.signingCtx.privateKey, {
    alg: options.signingCtx.alg,
    typ: options.signingCtx.typ ?? "example+sd-jwt",
    ...(options.signingCtx.kid !== undefined ? { kid: options.signingCtx.kid } : {}),
  });
  return assemble({
    issuerJwt,
    disclosures: encodedDisclosures,
    ...(options.keyBinding !== undefined ? { keyBinding: options.keyBinding } : {}),
  });
}

// ---------------------------------------------------------------------------
// Internal: assemble issuer JWT + disclosures + optional KB-JWT into compact
// SD-JWT serialization.
// ---------------------------------------------------------------------------

async function assemble(args: {
  issuerJwt: string;
  disclosures: string[];
  keyBinding?: KeyBindingCtx;
}): Promise<string> {
  const parts: ParsedSdJwt = {
    issuerJwt: args.issuerJwt,
    disclosures: args.disclosures,
    kbJwt: undefined,
  };

  if (args.keyBinding) {
    const sdHash = await computeSdHash(parts);
    const kbJwt = await buildKbJwt(args.keyBinding.privateKey, {
      audience: args.keyBinding.audience,
      nonce: args.keyBinding.nonce,
      sdHash,
      alg: args.keyBinding.alg,
      typ: "kb+sd-jwt",
      ...(args.keyBinding.kid !== undefined ? { kid: args.keyBinding.kid } : {}),
    });
    parts.kbJwt = kbJwt;
  }
  return serializeSdJwt(parts);
}
