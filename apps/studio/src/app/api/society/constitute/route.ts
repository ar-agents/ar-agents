/**
 * `POST /api/society/constitute` (auth): the irreversible constitution act.
 * Forwards the human-confirmed draft to ar-agents.ar's
 * /api/incorporate-attested, then stores the returned credentials against
 * this account (custodial; also returned once in the response so the human
 * can self-custody them). One society per account: 409 if one already
 * exists. Rate limit 2/day/account. See docs/CONTRACT.md.
 */

import { z } from "zod";
import { authenticate, getStoredSociety, setStoredSociety, type StoredSociety } from "@/lib/account";
import { incorporateAttested } from "@/lib/aragents";
import { kvRateLimit } from "@/lib/ratelimit";
import { canonicalCuit, initialSocietySummary, SocietyDraftSchema } from "@/lib/society";

export const runtime = "nodejs"; // matches the upstream's own runtime for this durable-write path

const BodySchema = z.object({
  draft: SocietyDraftSchema,
  administrador: z.object({
    nombre: z.string().trim().min(2).max(120),
    cuit: z.string().min(1).max(40),
  }),
  acepta102: z.literal(true),
});

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Durable-write path: fail CLOSED if the durable cross-isolate quota is
  // down, rather than waving through unlimited constitutions for this account.
  if (!(await kvRateLimit("society-constitute", auth.accountId, 2, 24 * 60 * 60, { failClosed: true }))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // art. 102 acceptance is checked first, ahead of full schema validation, so
  // an otherwise-valid request missing it gets the specific, actionable
  // message rather than a generic schema error.
  const acepta102 = (raw as { acepta102?: unknown } | null)?.acepta102;
  if (acepta102 !== true) {
    return Response.json(
      {
        ok: false,
        error: "art102_no_aceptado",
        message: "Tenés que aceptar la responsabilidad como administrador (art. 102).",
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

  const cuit = canonicalCuit(parsed.data.administrador.cuit);
  if (!cuit) {
    return Response.json(
      { ok: false, error: "cuit_invalido", message: "El CUIT del administrador no es válido." },
      { status: 422 },
    );
  }

  const existing = await getStoredSociety(auth.accountId);
  if (existing) {
    return Response.json(
      {
        ok: false,
        error: "ya_tiene_sociedad",
        message: "Esta cuenta ya tiene una sociedad constituida.",
      },
      { status: 409 },
    );
  }

  const upstream = await incorporateAttested({
    draft: parsed.data.draft,
    administrador: { nombre: parsed.data.administrador.nombre, cuit },
    acepta102: true,
  });

  if (!upstream.ok) {
    return Response.json(
      { ok: false, error: "upstream_error", detail: upstream.data ?? upstream.error },
      { status: upstream.status ?? 502 },
    );
  }
  const body = upstream.data;
  if (!body.ok || !body.sociedad || !body.audit?.sessionId || !body.adminToken || !body.gateToken) {
    return Response.json(
      { ok: false, error: "upstream_error", detail: body },
      { status: 502 },
    );
  }

  const stored: StoredSociety = {
    sessionId: body.audit.sessionId,
    denominacion: body.sociedad.denominacion,
    tipo: body.sociedad.tipo,
    registryId: body.registry?.id ?? null,
    adminToken: body.adminToken,
    gateToken: body.gateToken,
    createdAt: new Date().toISOString(),
  };
  await setStoredSociety(auth.accountId, stored);

  return Response.json({
    ok: true,
    society: initialSocietySummary(stored),
    credentials: { adminToken: body.adminToken, gateToken: body.gateToken },
    formationPack: body.formationPack ?? null,
    deploy: body.deploy ?? null,
  });
}
