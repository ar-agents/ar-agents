/**
 * GET /.well-known/sociedad-ia/keys
 *
 * RFC-005 § 4 public keys endpoint. Returns the Ed25519 public keys
 * this sociedad-IA uses to sign operational-log entries (additive to
 * the RFC-004 v1 HMAC scheme).
 *
 * The reference implementation publishes a single demo key here. Real
 * operators would publish their own key + would rotate periodically
 * (old keys stay in the list with validUntil set so historical entries
 * remain verifiable).
 *
 * Edge runtime. Cached 15 min (matches RFC-005 § 4 recommendation).
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

interface PublishedKey {
  keyId: string;
  alg: "ed25519";
  /** SubjectPublicKeyInfo (SPKI) DER encoded as base64url. */
  publicKey: string;
  /** Convenience: raw 32-byte public key as hex (the actual Ed25519 point). */
  publicKeyRaw: string;
  validFrom: string;
  validUntil: string | null;
}

// Demo key for the reference implementation. Generated 2026-05-11.
// Private key lives in the operator's secrets manager (AUDIT_ED25519_PRIVATE_KEY env);
// only the public part is published here.
const DEMO_KEY_SPKI_B64URL =
  "MCowBQYDK2VwAyEAEt29qtbtds8OzafRASPKZHztjC7hRDDx_2cz6NXzAVc";
const DEMO_KEY_RAW_HEX =
  "12ddbdaad6ed76cf0ecda7d10123ca647ced8c2ee14430f1ff6733e8d5f30157";

const KEYS: PublishedKey[] = [
  {
    keyId: "ar-agents-ref-2026-05",
    alg: "ed25519",
    publicKey: DEMO_KEY_SPKI_B64URL,
    publicKeyRaw: DEMO_KEY_RAW_HEX,
    validFrom: "2026-05-11T00:00:00Z",
    validUntil: null,
  },
];

export async function GET() {
  return NextResponse.json(
    {
      $schema: "https://ar-agents.ar/schemas/keys.v1.json",
      spec: "https://ar-agents.ar/rfcs/005",
      issuer: {
        jurisdiction: "AR",
        entityId: "ar-sociedad:reference-impl",
        denominacion: "ar-agents reference implementation",
      },
      keys: KEYS,
      note: "Reference-implementation demo key. Private key custody lives in the operator's secrets manager and is not exposed here. Implements RFC-005 v1 § 4. Real sociedades-IA replace this with their own keypair.",
      issuedAt: new Date().toISOString(),
    },
    {
      headers: {
        "cache-control": "public, max-age=900, stale-while-revalidate=3600",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
