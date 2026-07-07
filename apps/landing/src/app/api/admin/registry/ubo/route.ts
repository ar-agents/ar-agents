/**
 * /api/admin/registry/ubo — INTERNAL, admin-only (REGISTRY_ADMIN_TOKEN,
 * constant-time, fail-closed). Manage an entity's UBO (ultimate beneficial owner).
 *
 *   GET  ?entityId=<slug>  -> { profile, link, bankable } (PII visible: admin only).
 *   POST { entityId, legalName, govIdType, govId, jurisdiction, email?, createLink? }
 *        -> set the controlling UBO profile; optionally mint a self-attested link.
 *
 * PHASE 1: self-attested only. Authoritative verification (levels 1-2) is a
 * regulated activity (Ley 25.326 + AML) and is NOT wired. The public oracle
 * exposes only PII-FREE ubo STATUS; the name + gov id never leave this admin route.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { isRegistryAdmin } from "@/lib/admin-auth";
import { getRecord } from "@/lib/registry-store";
import {
  setUboProfile,
  linkUbo,
  getUboProfile,
  getUboLink,
  bankablePredicate,
  UboVerificationNotAvailableError,
  type GovIdType,
  type UBOVerificationMethod,
} from "@/lib/ubo";

export const runtime = "nodejs";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };
const VALID_GOVID = new Set<GovIdType>(["CUIL", "CUIT", "passport", "other"]);

export async function GET(req: Request) {
  if (!(await isRegistryAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  }
  const entityId = new URL(req.url).searchParams.get("entityId")?.trim();
  if (!entityId) return jsonCors({ ok: false, error: "missing entityId" }, { status: 400, ...NO_STORE });
  const [profile, link, bankable] = await Promise.all([
    getUboProfile(entityId),
    getUboLink(entityId),
    bankablePredicate(entityId),
  ]);
  return jsonCors({ ok: true, entityId, profile, link, bankable }, NO_STORE);
}

export async function POST(req: Request) {
  if (!(await isRegistryAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonCors({ ok: false, error: "invalid_json" }, { status: 400, ...NO_STORE });
  }

  const entityId = typeof body.entityId === "string" ? body.entityId.trim() : "";
  const legalName = typeof body.legalName === "string" ? body.legalName.trim() : "";
  const govIdType = typeof body.govIdType === "string" ? (body.govIdType as GovIdType) : "other";
  const govId = typeof body.govId === "string" ? body.govId.trim() : "";
  const jurisdiction = typeof body.jurisdiction === "string" ? body.jurisdiction.trim() : "AR";
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const createLink = body.createLink === true;
  const method: UBOVerificationMethod =
    typeof body.method === "string" ? (body.method as UBOVerificationMethod) : "self-attested";

  if (!entityId) return jsonCors({ ok: false, error: "missing entityId" }, { status: 400, ...NO_STORE });
  if (!legalName || !govId) {
    return jsonCors({ ok: false, error: "legalName and govId are required" }, { status: 400, ...NO_STORE });
  }
  if (!VALID_GOVID.has(govIdType)) {
    return jsonCors({ ok: false, error: "invalid govIdType" }, { status: 400, ...NO_STORE });
  }
  // The entity must exist in the registry (seed or KV).
  if (!(await getRecord(entityId))) {
    return jsonCors({ ok: false, error: "entity_not_found" }, { status: 404, ...NO_STORE });
  }

  const profile = await setUboProfile(entityId, {
    legalName,
    govId: { type: govIdType, value: govId },
    jurisdiction,
    ...(email ? { contact: { email } } : {}),
  });
  if (!profile) return jsonCors({ ok: false, error: "unwritable" }, { status: 503, ...NO_STORE });

  let link = null;
  if (createLink) {
    try {
      link = await linkUbo(entityId, method);
    } catch (e) {
      if (e instanceof UboVerificationNotAvailableError) {
        return jsonCors({ ok: false, error: "verification_not_available" }, { status: 501, ...NO_STORE });
      }
      throw e;
    }
  }
  const bankable = await bankablePredicate(entityId);
  return jsonCors({ ok: true, entityId, profile, link, bankable }, NO_STORE);
}

export async function OPTIONS() {
  return preflight();
}
