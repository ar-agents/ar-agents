import { preflight } from "@/lib/cors";
import { b64ToBytes } from "@/lib/opentimestamps";
import { readAnchorProof } from "@/lib/ledger";

/**
 * GET /api/audit/anchor/{seq}/ots: the raw OpenTimestamps proof for anchor
 * {seq}, as application/octet-stream. This is the TRUST-ROOT delivery: the .ots
 * file + Bitcoin is the proof; this server is just a CDN for it. A third party
 * verifies WITHOUT any ar-agents code:
 *
 *   curl -s https://ar-agents.ar/api/audit/anchor/3/ots -o anchor-3.ots
 *   ots verify anchor-3.ots            # checks the commit against Bitcoin
 *
 * (RFC-006 §6.1.) No ar-agents key is in the trust path.
 */

export const runtime = "edge";

export async function GET(_req: Request, ctx: { params: Promise<{ seq: string }> }) {
  const { seq: seqRaw } = await ctx.params;
  const seq = Number(seqRaw);
  if (!Number.isInteger(seq) || seq < 1) {
    return new Response(JSON.stringify({ error: "invalid_seq" }), {
      status: 400,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }
  const proof = await readAnchorProof(seq);
  if (!proof) {
    return new Response(
      JSON.stringify({ error: "not_found", note: "no OTS proof for this anchor (OTS may be disabled or not yet stamped)" }),
      {
        status: 404,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      },
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = b64ToBytes(proof.otsBase64);
  } catch {
    return new Response(JSON.stringify({ error: "corrupt_proof" }), {
      status: 500,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="anchor-${seq}.ots"`,
      "x-ots-status": proof.status,
      "x-ots-digest": proof.digest,
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60, s-maxage=300",
    },
  });
}

export async function OPTIONS() {
  return preflight();
}
