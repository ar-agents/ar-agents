import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import {
  createAnchor,
  readAnchorProofs,
  readAnchors,
  readHead,
  upgradeAnchorProof,
  verifyLedger,
} from "@/lib/ledger";

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

export async function GET(req: Request) {
  const url = new URL(req.url);

  // ?upgrade=1: re-query the OTS calendars for any pending proofs and persist
  // those that have confirmed into a Bitcoin block. Rate-limited like POST.
  // ADDITIVE: absent this param the response shape is a superset of the old one.
  if (url.searchParams.get("upgrade") === "1") {
    if (!rateLimit("audit-anchor-upgrade", clientIp(req), 4, 60 * 60_000)) {
      return jsonCors({ ok: false, error: "rate_limited", note: "max 4/hora por IP" }, { status: 429 });
    }
    const before = await readAnchorProofs();
    const pendingSeqs = Object.keys(before)
      .map(Number)
      .filter((seq) => before[seq]?.status === "pending");
    const upgraded: number[] = [];
    for (const seq of pendingSeqs) {
      const res = await upgradeAnchorProof(seq);
      if (res && res.status === "bitcoin") upgraded.push(seq);
    }
    const proofs = await readAnchorProofs();
    return jsonCors({ ok: true, upgraded, proofs }, { status: 200 });
  }

  const [anchors, head, v, proofs] = await Promise.all([
    readAnchors(),
    readHead(),
    verifyLedger(),
    readAnchorProofs(),
  ]);
  return jsonCors(
    {
      $schema: "https://ar-agents.ar/schemas/anchor-chain.v1.json",
      spec: "https://ar-agents.ar/rfcs/006",
      head,
      count: anchors.length,
      anchors,
      verification: v.anchors,
      // ADDITIVE (RFC-006 §6.1): public OpenTimestamps proofs keyed by anchor.seq.
      proofs,
      publicTimestamp:
        "Each proof commits sha256(canonical006(AnchorBody)) — the same bytes the HMAC anchor signs — to the public Bitcoin calendars via OpenTimestamps. Fetch the raw .ots at /api/audit/anchor/{seq}/ots and run `ots verify` against Bitcoin: no ar-agents key is in the trust path. Pending proofs upgrade to a Bitcoin-confirmed attestation over hours (GET ?upgrade=1).",
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
