// POST /api/ap2/issue-demo
// Issues a fresh Direct-flow Closed Checkout Mandate signed with the
// demo merchant + agent keys, ready to paste into the verifier.

import { NextRequest } from "next/server";
import { issueDemoMandate } from "@/lib/ap2";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { merchant_id?: string; order_id?: string } | null = null;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = null;
  }
  const result = await issueDemoMandate(body ?? {});
  return Response.json({
    presentation: result.presentation,
    closed_mandate: result.closedMandate,
    inner_checkout: result.checkoutPayload,
    public_keys: result.keys,
  });
}
