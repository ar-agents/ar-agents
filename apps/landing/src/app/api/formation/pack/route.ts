/**
 * GET /api/formation/pack?id=<slug> — re-fetch an entity's Formation Pack.
 *
 * The pack is delivered in the incorporation response at birth; this route lets an
 * operator/agent re-fetch it later. The stored SIDECAR is the single source of
 * truth; the human drafts (estatuto/IGJ/AFIP) are re-rendered from it here so they
 * can never drift from the machine record.
 *
 * ADMIN-GATED (REGISTRY_ADMIN_TOKEN, constant-time, fail-closed): the sidecar
 * carries the representante's SELF-DECLARED name + CUIT (PII), so it is NOT public.
 * BORRADOR: the documents are drafts to review with a notary/lawyer, never legal
 * advice (validated:false travels in the response).
 */

import { jsonCors, preflight } from "@/lib/cors";
import { constantTimeEqual } from "@/lib/incorporate-auth";
import { getRecord } from "@/lib/registry-store";
import { renderDocumentsFromSidecar, type FormationSidecar } from "@/lib/formation-pack";

export const runtime = "nodejs";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

async function isAdmin(req: Request): Promise<boolean> {
  const configured = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  if (!configured) return false; // fail-closed
  const presented =
    req.headers.get("x-admin-token")?.trim() ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;
  return constantTimeEqual(presented, configured);
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  }
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return jsonCors({ ok: false, error: "missing id" }, { status: 400, ...NO_STORE });

  const rec = await getRecord(id);
  if (!rec) return jsonCors({ ok: false, error: "not_found" }, { status: 404, ...NO_STORE });

  const sidecar = rec.formation?.sidecar as unknown as FormationSidecar | undefined;
  if (!sidecar) {
    return jsonCors(
      { ok: false, error: "no_formation_pack", note: "this entity was not formed via the incorporation pipeline" },
      { status: 404, ...NO_STORE },
    );
  }

  return jsonCors(
    {
      ok: true,
      id: rec.id,
      status: rec.status,
      formationPack: {
        sidecar,
        documents: renderDocumentsFromSidecar(sidecar),
        packHash: rec.formation?.packHash ?? null,
        checklist: rec.formation?.checklist ?? [],
        validated: false,
        disclaimer: sidecar.disclaimer,
      },
    },
    NO_STORE,
  );
}

export async function OPTIONS() {
  return preflight();
}
