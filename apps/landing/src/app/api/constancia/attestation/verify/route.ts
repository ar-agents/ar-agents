/**
 * `POST /api/constancia/attestation/verify`, server-side attestation check.
 *
 * A convenience surface: POST a `ConstanciaAttestation` (raw, or `{ attestation }`)
 * and get back whether its Ed25519 signature is valid and whether the signing
 * key matches ar-agents' published key. The canonical check is OFFLINE and
 * never has to trust this server: verify `signature` over `canonical(body)`
 * with the SPKI public key at /.well-known/sociedad-ia/keys.
 *
 * Edge runtime: verification is pure Web Crypto (no node-forge, no KV).
 */

import { jsonCors, preflight } from "@/lib/cors";
import {
  verifyConstanciaAttestation,
  type ConstanciaAttestation,
} from "@/lib/constancia-attestation";
import { operatorPublicKeySpki } from "@/lib/ed25519";

export const runtime = "edge";

export async function POST(req: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonCors(
      {
        error: "bad_request",
        note: "Enviá la attestation como JSON (el objeto entero o { attestation }).",
      },
      { status: 400 },
    );
  }

  const wrapped = payload as { attestation?: unknown };
  const attestation = (wrapped?.attestation ?? payload) as ConstanciaAttestation;

  const result = await verifyConstanciaAttestation(attestation);

  // Trust check: is the embedded key the one ar-agents publishes?
  const operatorKey = operatorPublicKeySpki();
  const matchesPublishedKey = Boolean(
    operatorKey && attestation?.publicKey === operatorKey,
  );

  return jsonCors({
    ...result,
    matchesPublishedKey,
    publicKeys: "https://ar-agents.ar/.well-known/sociedad-ia/keys",
  });
}

export function OPTIONS(): Response {
  return preflight();
}
