/**
 * GET /.well-known/sociedad-ia/verify-key?challenge={hex}
 *
 * RFC-004 § 5 challenge-response endpoint. The verifier (regulator,
 * counterpart, certifier) sends a random hex challenge; the sociedad-IA
 * server returns:
 *
 *   {
 *     "scheme": "rfc-004-v1-hmac-sha256",
 *     "challenge": "{the challenge they sent}",
 *     "response": "sha256:{HMAC of the challenge}",
 *     "keyFingerprint": "sha256:{HMAC of a fixed string under the key}",
 *     "issuedAt": "ISO-8601"
 *   }
 *
 * Properties:
 *  - The response proves the server holds the AUDIT_HMAC_SECRET WITHOUT
 *    revealing it.
 *  - The keyFingerprint is stable across challenges, so a verifier can
 *    confirm key continuity (or detect rotation) across sessions.
 *  - Without a challenge param, returns a 400 telling the caller what
 *    to send.
 *
 * The challenge MUST be:
 *  - 16-128 hex characters (8-64 bytes of entropy)
 *  - Otherwise a 400 is returned
 *
 * This complements the /api/play/audit/{id}?verify=1 endpoint:
 *  - verify=1 confirms the entries are unmodified (HMAC matches).
 *  - This endpoint confirms the server still holds the original key.
 *  - Together they let a regulator verify both "log isn't tampered"
 *    and "key isn't rotated without disclosure".
 *
 * Edge runtime, no state.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

const enc = new TextEncoder();
const KEY_FINGERPRINT_CONST = "rfc-004-key-fingerprint-v1";

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const challenge = (searchParams.get("challenge") || "").trim();

  if (!challenge) {
    return NextResponse.json(
      {
        error: "Missing required query parameter: challenge",
        instructions: "Send GET /.well-known/sociedad-ia/verify-key?challenge=HEX where HEX is 16-128 hex characters of random entropy.",
        scheme: "rfc-004-v1-hmac-sha256",
        spec: "https://ar-agents.vercel.app/rfcs/004",
      },
      { status: 400 },
    );
  }

  if (!/^[0-9a-fA-F]{16,128}$/.test(challenge)) {
    return NextResponse.json(
      {
        error: "Invalid challenge format. Must be 16-128 hex characters.",
        scheme: "rfc-004-v1-hmac-sha256",
      },
      { status: 400 },
    );
  }

  const secret = process.env.AUDIT_HMAC_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        error: "Key not provisioned",
        detail: "This sociedad-IA has not wired AUDIT_HMAC_SECRET. In production, this is a fatal configuration error.",
        scheme: "rfc-004-v1-hmac-sha256",
        hmacWired: false,
      },
      { status: 503 },
    );
  }

  // Normalize challenge to lowercase hex for canonical response.
  const normalized = challenge.toLowerCase();

  const [response, keyFingerprint] = await Promise.all([
    hmacHex(secret, normalized),
    hmacHex(secret, KEY_FINGERPRINT_CONST),
  ]);

  return NextResponse.json(
    {
      scheme: "rfc-004-v1-hmac-sha256",
      spec: "https://ar-agents.vercel.app/rfcs/004",
      challenge: normalized,
      response: `sha256:${response}`,
      keyFingerprint: `sha256:${keyFingerprint}`,
      keyFingerprintConst: KEY_FINGERPRINT_CONST,
      issuedAt: new Date().toISOString(),
      verification: {
        howTo: "Compute sha256:<hex(HMAC-SHA256(secret, challenge))>. Match the `response` field. If `response` matches AND `keyFingerprint` matches what you remember from previous interactions, the server proved continuity of key possession without revealing the key.",
        spec: "https://ar-agents.vercel.app/rfcs/004#section-5",
      },
    },
    {
      headers: {
        // Never cache — the response depends on the challenge.
        "cache-control": "no-store, no-cache, must-revalidate",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
