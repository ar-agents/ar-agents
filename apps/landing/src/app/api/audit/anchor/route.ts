import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createAnchor, readAnchors, readHead, verifyLedger } from "@/lib/ledger";

/**
 * /api/audit/anchor: the RFC-006 §6 anchor chain.
 *
 * GET returns every anchor (each one HMAC-signs the chain head and commits to
 * the previous anchor) plus its verification. Anyone can poll and store these
 * snapshots as an external witness: once a third party holds anchor N, we
 * cannot rewrite anything at or below headSeq N without being caught.
 *
 * POST forces a new anchor of the current head (rate-limited). Public on
 * purpose: letting anyone seal the head is what makes witnessing cheap.
 */

export const runtime = "edge";

export async function GET() {
  const [anchors, head, v] = await Promise.all([readAnchors(), readHead(), verifyLedger()]);
  return jsonCors(
    {
      $schema: "https://ar-agents.ar/schemas/anchor-chain.v1.json",
      spec: "https://ar-agents.ar/rfcs/006",
      head,
      count: anchors.length,
      anchors,
      verification: v.anchors,
      witness:
        "Store any anchor you fetch. Once you hold anchor N, history at or below headSeq N cannot be rewritten without detection.",
    },
    { headers: { "cache-control": "public, max-age=10, s-maxage=30" } },
  );
}

export async function POST(req: Request) {
  if (!rateLimit("audit-anchor", clientIp(req), 4, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited", note: "max 4/hora por IP" }, { status: 429 });
  }
  const anchor = await createAnchor();
  if (!anchor) {
    return jsonCors(
      { ok: false, error: "not_available", note: "ledger vacío o secreto sin configurar" },
      { status: 503 },
    );
  }
  return jsonCors({ ok: true, anchor });
}

export async function OPTIONS() {
  return preflight();
}
