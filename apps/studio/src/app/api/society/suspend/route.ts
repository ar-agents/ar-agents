/**
 * `POST /api/society/suspend` (auth): the kill switch. `{ suspend: true }`
 * calls the upstream `/api/suspender`; `{ suspend: false }` calls
 * `/api/reanudar`. See docs/CONTRACT.md.
 */

import { z } from "zod";
import { authenticate, getStoredSociety } from "@/lib/account";
import { resumeSociety, suspendSociety } from "@/lib/aragents";
import { kvRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const BodySchema = z.object({
  suspend: z.boolean(),
  motivo: z.string().trim().max(500).optional(),
  acepta: z.literal(true),
});

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  if (!(await kvRateLimit("society-suspend", auth.accountId, 20, 60 * 60))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const society = await getStoredSociety(auth.accountId);
  if (!society) {
    return Response.json({ ok: false, error: "sin_sociedad" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // Reaffirming art. 102 responsibility is checked ahead of full schema
  // validation, so a missing `acepta` gets the specific, actionable message.
  const acepta = (raw as { acepta?: unknown } | null)?.acepta;
  if (acepta !== true) {
    return Response.json(
      {
        ok: false,
        error: "art102_no_aceptado",
        message: "Reafirmá tu responsabilidad como administrador (art. 102).",
      },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "cuerpo_invalido", detail: parsed.error.format() },
      { status: 400 },
    );
  }

  const call = parsed.data.suspend ? suspendSociety : resumeSociety;
  const upstream = await call({
    society: society.sessionId,
    adminToken: society.adminToken,
    motivo: parsed.data.motivo,
    acepta: true,
  });

  if (!upstream.ok) {
    return Response.json({ ok: false, error: "upstream_error" }, { status: upstream.status ?? 502 });
  }
  return Response.json(upstream.data);
}
