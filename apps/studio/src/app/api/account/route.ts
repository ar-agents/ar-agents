/**
 * `POST /api/account` (no auth): create an anonymous studio account.
 * `GET /api/account` (auth): profile + usage + cap + the account's society.
 *
 * See docs/CONTRACT.md.
 */

import { authenticate, createAccount, getAccountProfile, getStoredSociety } from "@/lib/account";
import { checkCap, getUsage } from "@/lib/meter";
import { clientIp, kvRateLimit, rateLimit } from "@/lib/ratelimit";
import { buildSocietySummary } from "@/lib/society";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit("account-create", ip, 5, 60 * 60_000)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("account-create", ip, 5, 60 * 60))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const created = await createAccount();
  if (!created) {
    return Response.json({ ok: false, error: "no_se_pudo_crear_la_cuenta" }, { status: 500 });
  }
  return Response.json(
    { ok: true, accountId: created.accountId, token: created.token },
    { status: 201 },
  );
}

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const profile = await getAccountProfile(auth.accountId);
  if (!profile) {
    return Response.json({ ok: false, error: "cuenta_no_encontrada" }, { status: 404 });
  }

  const [usage, cap, stored] = await Promise.all([
    getUsage(auth.accountId),
    checkCap(auth.accountId),
    getStoredSociety(auth.accountId),
  ]);
  const society = stored ? await buildSocietySummary(stored) : null;

  return Response.json({
    ok: true,
    accountId: profile.accountId,
    createdAt: profile.createdAt,
    usage: {
      month: usage.month,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costMicroUsd: usage.costMicroUsd,
      priceMicroUsd: usage.priceMicroUsd,
    },
    cap: { monthlyCostMicroUsd: cap.monthlyCostMicroUsd, remainingMicroUsd: cap.remainingMicroUsd },
    society,
  });
}
