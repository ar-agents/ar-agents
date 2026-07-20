/**
 * `GET /api/identity/[id]`, the machine-readable verified-agent record.
 *
 * Returns the stored proof for one agent so a counterparty can re-verify it
 * OFFLINE, trusting no one: the full signed doc, the recomputed docHash, the
 * binding, and a pointer to the open verification method. We do not re-run
 * crypto here; the point is that the caller can, with the doc we return.
 *
 * 404 when the id is unknown (or KV is unwired). CORS-open + cacheable.
 * Runtime nodejs (KV).
 */

import { jsonCors, preflight } from "@/lib/cors";
import {
  getAgentRecord,
  isValidAgentId,
  badgeUrl,
  profileUrl,
} from "@/lib/agent-registry";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const norm = id.toLowerCase();
  if (!isValidAgentId(norm)) {
    return jsonCors({ error: "invalid_id" }, { status: 400 });
  }
  const record = await getAgentRecord(norm);
  if (!record) {
    return jsonCors(
      {
        error: "not_found",
        note:
          "No verified agent with this id. Either it was never verified, or this deployment has no KV wired.",
      },
      { status: 404 },
    );
  }

  return jsonCors(
    {
      $schema: "https://ar-agents.ar/schemas/agent-identity.v1.json",
      id: record.id,
      scheme: record.scheme,
      subject: record.subject,
      chainId: record.chainId,
      accountType: record.accountType,
      // Cryptographically established (the only asserted facts).
      proof: {
        docHash: record.docHash,
        binding: record.binding,
        doc: record.doc,
        method:
          record.scheme === "evm-secp256k1"
            ? "evm_secp256k1 (EIP-191 ecrecover, or EIP-1271 isValidSignature)"
            : "ed25519_key_binding",
        howToVerify:
          "Recompute sha256 over the canonical doc with binding=null; rebuild the statement from identity + that hash + issuedAt; check the signature. Reference impl: @ar-agents/identity-attest/key-binding. Nothing here requires trusting ar-agents.",
      },
      // Self-declared by the agent (NOT verified).
      selfDeclared: {
        name: record.name ?? null,
        operator: record.operator ?? null,
        homepage: record.homepage ?? null,
        jurisdiction: record.jurisdiction ?? null,
        evidence: record.evidence ?? null,
        origin: record.origin,
      },
      firstVerifiedAt: record.firstVerifiedAt,
      lastVerifiedAt: record.lastVerifiedAt,
      profileUrl: profileUrl(record.id),
      badgeUrl: badgeUrl(record.id),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
      },
    },
  );
}

export function OPTIONS(): Response {
  return preflight();
}
