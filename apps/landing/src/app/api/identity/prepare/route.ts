/**
 * `POST /api/identity/prepare`, the "what do I sign?" helper.
 *
 * Paste mode needs the agent to sign the EXACT canonical statement our verifier
 * will reconstruct. Rather than make every client re-implement our
 * canonicalization, they POST their draft doc (with `binding` omitted or null)
 * and get back the `docHash` + `statement` to sign. Stateless, no persistence,
 * no crypto secret. The agent signs `statement` with its own key, drops the
 * signature into `binding`, and calls /api/identity/verify.
 *
 * Deterministic: `issuedAt` comes from the doc, so the same draft always yields
 * the same statement. Runtime nodejs to share the workspace package resolution
 * with the sibling routes.
 */

import {
  canonicalIdentityStatement,
  identityDocHash,
  type IdentityDoc as KeyBindingDoc,
} from "@ar-agents/identity-attest/key-binding";
import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { IdentityDocSchema } from "@/lib/agent-registry";

export const runtime = "nodejs";

const RL_MAX = 60;
const RL_WINDOW_MS = 60_000;

async function handle(req: Request): Promise<Response> {
  if (!rateLimit("identity-prepare", clientIp(req), RL_MAX, RL_WINDOW_MS)) {
    return jsonCors(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: { doc?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonCors({ error: "bad_request", note: "Send JSON." }, { status: 400 });
  }

  // Accept the doc with binding omitted; force it null for hashing either way.
  const draft =
    body.doc && typeof body.doc === "object"
      ? { ...(body.doc as Record<string, unknown>), binding: null }
      : null;

  // Validate the identity fields (binding null is allowed by the schema).
  const parsed = IdentityDocSchema.safeParse(draft);
  if (!parsed.success) {
    return jsonCors(
      {
        error: "bad_request",
        note: "doc.identity (scheme + address/publicKey) and issuedAt are required.",
        issues: parsed.error.issues.slice(0, 8),
      },
      { status: 400 },
    );
  }
  const doc = parsed.data;

  // Guard scheme-specific required fields for a clear message.
  if (doc.identity.scheme === "evm-secp256k1" && !doc.identity.address) {
    return jsonCors(
      { error: "bad_request", note: "evm-secp256k1 requires identity.address." },
      { status: 400 },
    );
  }
  if (doc.identity.scheme === "ed25519" && !doc.identity.publicKey) {
    return jsonCors(
      { error: "bad_request", note: "ed25519 requires identity.publicKey." },
      { status: 400 },
    );
  }

  const docHash = await identityDocHash(doc as unknown as KeyBindingDoc);
  const statement = canonicalIdentityStatement(
    doc.identity,
    docHash,
    doc.issuedAt,
  );

  return jsonCors({
    docHash,
    statement,
    note:
      doc.identity.scheme === "evm-secp256k1"
        ? "Sign `statement` with EIP-191 personal_sign (your wallet's signMessage), then put the 0x signature in doc.binding.signature with scheme 'eip-191'."
        : "Sign the UTF-8 bytes of `statement` with your Ed25519 key, then put the hex/base64url signature in doc.binding.signature with scheme 'ed25519'.",
  });
}

export { handle as POST };

export function OPTIONS(): Response {
  return preflight();
}
