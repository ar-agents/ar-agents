/**
 * The kill-switch state + the act of throwing it.
 *
 * A constituted Sociedad Automatizada can be SUSPENDED by its administrator: the
 * art. 102 supervision duty made operational. Suspension is authorized by
 * matching the caller's CUIT against the administrator recorded in the society's
 * signed audit log (you can only suspend a society you constituted), then
 * recorded as its own signed, durable audit entry, then flipped in the
 * suspension set. The generated society's agent consults the state (via
 * /api/suspension-status) and its central enforcement (`enforceRiskPolicy`'s
 * `isHalted`) refuses every tool while suspended.
 *
 * Storage: a Vercel KV set, with an in-memory fallback for local dev / preview.
 */

import { kv } from "@vercel/kv";
import { type ApproverAttestation, appendAudit, type AuditEntry, readAudit } from "./audit";
import { jsonCors } from "./cors";
import { normalizeCuit } from "./incorporate";
import { clientIp, kvRateLimit, rateLimit } from "./ratelimit";
import { parseCuit } from "@ar-agents/identity";

const SUSPENDED_SET = "society:suspended";
const memSuspended = new Set<string>();

// Audit-log labels of the acts that establish a society's administrator.
const INCORPORATION_TOOLS = new Set([
  "auto_incorporate",
  "incorporate_from_prompt",
  "incorporate_attested",
]);

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

export async function setSuspended(societyId: string, suspended: boolean): Promise<void> {
  if (!isKvWired()) {
    if (suspended) memSuspended.add(societyId);
    else memSuspended.delete(societyId);
    return;
  }
  if (suspended) await kv.sadd(SUSPENDED_SET, societyId);
  else await kv.srem(SUSPENDED_SET, societyId);
}

/**
 * Whether a society is suspended. Throws on a KV error so the caller fails
 * closed: the generated agent's kill-switch (`withHalt`) refuses on a thrown
 * error, and the status endpoint surfaces the error so consumers fail closed too.
 */
export async function isSuspended(societyId: string): Promise<boolean> {
  if (!isKvWired()) return memSuspended.has(societyId);
  return Boolean(await kv.sismember(SUSPENDED_SET, societyId));
}

/**
 * The principal (e.g. `cuit:20123456786`) of the administrator who constituted
 * the society, read from the latest incorporation entry in its signed audit log.
 * null if the society has no incorporation record. This is the authorization
 * anchor for suspension: it ties the off-switch to the signed constitution.
 */
export async function societyAdminPrincipal(sessionId: string): Promise<string | null> {
  const entries = await readAudit(sessionId);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && INCORPORATION_TOOLS.has(e.tool) && e.approver?.principal) {
      return e.approver.principal;
    }
  }
  return null;
}

export type SuspensionResult =
  | { ok: false; status: 403 | 404 | 422; error: string }
  | { ok: true; suspended: boolean; entry: AuditEntry };

/**
 * Authorize (by CUIT match against the signed constitution) and apply a
 * suspend/resume, recording the act as a signed durable audit entry.
 */
export async function changeSuspension(opts: {
  society: string;
  nombre: string;
  cuit: string;
  motivo?: string;
  suspend: boolean;
}): Promise<SuspensionResult> {
  if (!parseCuit(opts.cuit).valid) {
    return { ok: false, status: 422, error: "cuit_invalido" };
  }
  const principal = `cuit:${normalizeCuit(opts.cuit)}`;
  const admin = await societyAdminPrincipal(opts.society);
  if (!admin) return { ok: false, status: 404, error: "sociedad_sin_registro" };
  if (admin !== principal) {
    return { ok: false, status: 403, error: "no_sos_el_administrador" };
  }

  const approver: ApproverAttestation = {
    method: "self-attested",
    principal,
    principalKind: "declared-cuit",
    declaredBy: opts.nombre,
  };
  // Record the act FIRST (it is the source of truth), then flip the flag.
  const entry = await appendAudit(
    opts.society,
    {
      tool: opts.suspend ? "suspender_sociedad" : "reanudar_sociedad",
      governance: "audit-logged",
      approver,
      input: { motivo: opts.motivo?.slice(0, 500) ?? null },
      output: { suspended: opts.suspend },
    },
    { durable: true },
  );
  await setSuspended(opts.society, opts.suspend);
  return { ok: true, suspended: opts.suspend, entry };
}

/**
 * HTTP glue shared by POST /api/suspender and /api/reanudar. Rate-limits,
 * requires the administrator to reaffirm art. 102 responsibility, then
 * authorizes + records via changeSuspension.
 */
export async function handleSuspensionRequest(req: Request, suspend: boolean): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit("suspension", ip, 20, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("suspension", ip, 20, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const b = raw as {
    society?: unknown;
    administrador?: { nombre?: unknown; cuit?: unknown };
    motivo?: unknown;
    acepta?: unknown;
  };
  if (b.acepta !== true) {
    return jsonCors(
      {
        ok: false,
        error: "art102_no_aceptado",
        message: "Reafirmá tu responsabilidad como administrador (art. 102).",
      },
      { status: 400 },
    );
  }
  const society = typeof b.society === "string" ? b.society.trim() : "";
  const nombre = typeof b.administrador?.nombre === "string" ? b.administrador.nombre.trim() : "";
  const cuit = typeof b.administrador?.cuit === "string" ? b.administrador.cuit : "";
  const motivo = typeof b.motivo === "string" ? b.motivo : undefined;
  if (!society) return jsonCors({ ok: false, error: "falta_society" }, { status: 400 });
  if (nombre.length < 2) {
    return jsonCors({ ok: false, error: "administrador_invalido" }, { status: 400 });
  }

  const r = await changeSuspension({ society, nombre, cuit, motivo, suspend });
  if (!r.ok) return jsonCors({ ok: false, error: r.error }, { status: r.status });
  return jsonCors({ ok: true, suspended: r.suspended, society, audit: { entry: r.entry } });
}
