import { jsonCors, preflight } from "@/lib/cors";
import { verifyLedger } from "@/lib/ledger";

/**
 * GET /api/audit/verify: server-side verification of the global RFC-006
 * hash chain + anchor chain. Convenience surface; the canonical check is
 * offline with arg-verify.mjs, which never has to trust this server.
 */

export const runtime = "edge";

export async function GET() {
  const res = await verifyLedger();
  return jsonCors(
    {
      $schema: "https://ar-agents.ar/schemas/ledger-verification.v1.json",
      spec: "https://ar-agents.ar/rfcs/006",
      verifiedAt: new Date().toISOString(),
      head: res.head,
      chain: res.chain,
      anchors: res.anchors,
      offline:
        "curl -s https://ar-agents.ar/arg-verify.mjs -o arg-verify.mjs and verify any export bundle without trusting this server.",
    },
    { headers: { "cache-control": "public, max-age=10, s-maxage=30" } },
  );
}

export async function OPTIONS() {
  return preflight();
}
