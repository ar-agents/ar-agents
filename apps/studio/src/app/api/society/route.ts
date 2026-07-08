/**
 * `GET /api/society` (auth): the account's society summary, or null. See
 * docs/CONTRACT.md.
 */

import { authenticate, getStoredSociety } from "@/lib/account";
import { buildSocietySummary } from "@/lib/society";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const stored = await getStoredSociety(auth.accountId);
  const society = stored ? await buildSocietySummary(stored) : null;
  return Response.json({ ok: true, society });
}
