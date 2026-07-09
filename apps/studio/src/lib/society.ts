/**
 * The SocietyDraft the human previewed via the agent's `preview_society` tool
 * (a POST to ar-agents.ar's /api/incorporate-preview), re-validated here
 * before studio forwards it to /api/incorporate-attested -- the client is
 * never trusted, same as the upstream itself re-validates.
 *
 * Deliberately looser than ar-agents.ar's own `Body` schema
 * (apps/landing/src/lib/incorporate.ts) on one point: `piezas` is a plain
 * string array here rather than re-enumerating its ~16-member PIEZA_IDS
 * union. Duplicating that enum here would be a second source of truth that
 * drifts; the upstream's own strict schema is authoritative and rejects an
 * unknown pieza id, so this file only needs to bound the SHAPE studio sends.
 *
 * Also owns: CUIT format validation (11 ASCII digits after stripping
 * conventional separators -- format only, no check-digit; the checksum
 * algorithm lives in @ar-agents/identity, which studio does not depend on),
 * and assembling the public SocietySummary from the account's stored society
 * + a few best-effort upstream look-ups (good standing, suspension,
 * pending-approval count).
 */

import { z } from "zod";
import type { StoredSociety } from "./account";
import {
  goodStanding,
  pendingApprovalsPublic,
  suspensionStatus,
} from "./aragents";

export const SocietyDraftSchema = z.object({
  denominacion: z.string().trim().min(3).max(200),
  tipo: z.enum(["SAS", "SRL", "SA", "SOCIEDAD-IA"]),
  capitalSocial: z.number().positive(),
  objeto: z.string().trim().min(20).max(2000),
  representante: z
    .object({
      nombre: z.string().min(1).max(120),
      cuit: z.string().min(1).max(20),
    })
    .optional(),
  emailContacto: z.string().email().optional(),
  piezas: z.array(z.string()).optional(),
});
export type SocietyDraft = z.infer<typeof SocietyDraftSchema>;

// The conventional separators a human types in a CUIT: ASCII whitespace,
// dot, and the common dash characters. Mirrors
// apps/landing/src/lib/incorporate.ts's normalizeCuit/canonicalCuit, format
// -only (no check-digit here).
const CUIT_SEPARATORS = /[\s.­‐-―-]/g;

/** The 11-digit CUIT string iff, after stripping conventional separators,
 *  what remains is exactly 11 ASCII digits; otherwise null. */
export function canonicalCuit(raw: string): string | null {
  const stripped = String(raw ?? "").replace(CUIT_SEPARATORS, "");
  return /^[0-9]{11}$/.test(stripped) ? stripped : null;
}

export interface SocietySummary {
  sessionId: string;
  denominacion: string;
  tipo: string;
  registryId: string | null;
  createdAt: string;
  goodStanding: { state: string; score: number | null; rating: string | null } | null;
  suspended: boolean | null;
  pendingApprovals: number | null;
  /** Where the society's own agent app is deployed (M1-6), or null when it
   *  has not been deployed from studio yet. See src/lib/account.ts's
   *  SocietyDeploy. */
  deploy: { projectName: string; url: string; deployedAt: string } | null;
}

/** A freshly-constituted society's summary, with no upstream look-ups yet
 *  (used to answer the constitute route without an extra round trip). */
export function initialSocietySummary(s: StoredSociety): SocietySummary {
  return {
    sessionId: s.sessionId,
    denominacion: s.denominacion,
    tipo: s.tipo,
    registryId: s.registryId,
    createdAt: s.createdAt,
    goodStanding: null,
    suspended: false,
    pendingApprovals: 0,
    deploy: s.deploy ?? null,
  };
}

/**
 * Assemble the live SocietySummary for a stored society: three best-effort,
 * independent look-ups (each nullable on upstream failure, per CONTRACT.md).
 */
export async function buildSocietySummary(s: StoredSociety): Promise<SocietySummary> {
  const [gs, susp, pending] = await Promise.all([
    s.registryId
      ? goodStanding(s.registryId).catch(() => null)
      : Promise.resolve(null),
    suspensionStatus(s.sessionId).catch(() => null),
    pendingApprovalsPublic(s.sessionId).catch(() => null),
  ]);

  const goodStandingSummary =
    gs && gs.ok && gs.data.body?.found && gs.data.body.goodStanding
      ? {
          state: gs.data.body.goodStanding.state,
          score: gs.data.body.goodStanding.score,
          rating: gs.data.body.goodStanding.rating,
        }
      : null;

  const suspended = susp && susp.ok && typeof susp.data.suspended === "boolean" ? susp.data.suspended : null;

  const pendingApprovals =
    pending && pending.ok && Array.isArray(pending.data.pending) ? pending.data.pending.length : null;

  return {
    sessionId: s.sessionId,
    denominacion: s.denominacion,
    tipo: s.tipo,
    registryId: s.registryId,
    createdAt: s.createdAt,
    goodStanding: goodStandingSummary,
    suspended,
    pendingApprovals,
    deploy: s.deploy ?? null,
  };
}
