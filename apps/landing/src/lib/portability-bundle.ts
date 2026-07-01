/**
 * Portability Bundle — the BUILD side (KV-backed assembly).
 *
 * Gathers one entity's registry state from the live stores and assembles a signed,
 * verifiable, replayable bundle. The verify/replay logic is in the PURE core
 * (portability-bundle-core.ts) so a holder can check the bundle off our infra.
 *
 * PII gating: `includePii` (default true, the owner exporting their OWN full
 * state) controls whether the operator identity, the self-declared CUIT, the
 * formation sidecar, and the full UBO profile/link are included. The PII-free
 * subset (`includePii:false`) is what an entity can safely hand to a counterparty.
 * The owner-token secret hash is NEVER exported.
 *
 * CUIT authoritativeness: a self-declared CUIT is NEVER exported as an
 * authoritative identity claim. It is carried as `selfDeclaredCuit` unless
 * `hasAuthoritativeCuit(rec)` (seed / verified), mirroring the good-standing route.
 */

import {
  assembleBundle,
  SECTION,
  type SectionInput,
  type PortabilityBundle,
} from "./portability-bundle-core";
import { getRecord, hasAuthoritativeCuit } from "./registry-store";
import { getHistory } from "./registry-history";
import { listIncidents, incidentSummary } from "./registry-incidents";
import { scoreEntry, type ScoreInput } from "./good-standing-score";
import { getUboProfile, getUboLink, getUboStatus } from "./ubo";
import { readHead, readAnchors, readAnchorProofs } from "./ledger";

export interface BuildBundleOpts {
  /** Include operator identity, self-declared CUIT, formation sidecar, full UBO (PII). Default true. */
  includePii?: boolean;
  /** Override the generatedAt stamp (determinism in tests). */
  now?: string;
}

export async function buildBundle(id: string, opts?: BuildBundleOpts): Promise<PortabilityBundle | null> {
  const rec = await getRecord(id);
  if (!rec) return null;

  const includePii = opts?.includePii ?? true;
  const generatedAt = opts?.now ?? new Date().toISOString();

  const [history, incidents, summary, uboStatus, uboProfile, uboLink] = await Promise.all([
    getHistory(id),
    listIncidents(id),
    incidentSummary(id),
    getUboStatus(id),
    includePii ? getUboProfile(id) : Promise.resolve(null),
    includePii ? getUboLink(id) : Promise.resolve(null),
  ]);

  // Deterministic good-standing at generatedAt (so replay re-derives it exactly).
  const scoreInput: ScoreInput = {
    status: rec.status,
    state: rec.goodStanding.state,
    conformanceScore: rec.goodStanding.lastScore,
    lastCheckedAt: rec.goodStanding.lastCheckedAt,
    incidents: {
      openCritical: summary.openCritical,
      openWarning: summary.openWarning,
      openInfo: summary.openInfo,
    },
  };
  const nowMs = Date.parse(generatedAt);
  const score = scoreEntry(scoreInput, Number.isFinite(nowMs) ? { now: nowMs } : undefined);

  // ── Record section ──
  // The owner-token secret hash NEVER leaves the store. A self-declared CUIT is
  // carried as selfDeclaredCuit (never authoritative). formation.sidecar is PII.
  const authoritative = hasAuthoritativeCuit(rec);
  const { ownerTokenHash: _ownerTokenHash, formation, operatorCuit, ...rest } = rec;
  let recordSection: Record<string, unknown>;
  if (includePii) {
    recordSection = {
      ...rest,
      ...(operatorCuit
        ? authoritative
          ? { operatorCuit }
          : { selfDeclaredCuit: operatorCuit }
        : {}),
      ...(formation ? { formation } : {}),
    };
  } else {
    // Shareable subset: redact operator identity, drop formation + any self-declared
    // CUIT; keep an authoritative (public, verifiable) CUIT only.
    recordSection = {
      ...rest,
      operator: "[redacted]",
      ...(operatorCuit && authoritative ? { operatorCuit } : {}),
    };
  }

  // Incident notes are operator-authored free text (may reference people), so the
  // shareable subset carries the risk SIGNAL (kind/severity/dates) with the note
  // redacted; the owner's full export carries them verbatim.
  const incidentsForBundle = includePii
    ? incidents
    : incidents.map((i) => ({ ...i, note: "[redacted]" }));

  const sections: SectionInput[] = [
    { name: SECTION.record, data: recordSection, count: 1, pii: includePii },
    {
      name: SECTION.goodStanding,
      data: { standing: rec.goodStanding, input: scoreInput, result: score, issuedAt: generatedAt },
      count: 1,
      pii: false,
    },
    { name: SECTION.history, data: history, count: history.length, pii: false },
    { name: SECTION.incidents, data: incidentsForBundle, count: incidents.length, pii: includePii },
    { name: SECTION.railPosture, data: rec.railPosture ?? null, count: rec.railPosture ? 1 : 0, pii: false },
  ];

  // UBO status is PII-FREE (presence/level/method/bankable) — always include when present.
  if (uboStatus) {
    sections.push({ name: SECTION.uboStatus, data: uboStatus, count: 1, pii: false });
  }
  // The full UBO profile (legal name + gov id) + link IS PII — owner export only.
  if (includePii && (uboProfile || uboLink)) {
    sections.push({
      name: SECTION.ubo,
      data: { profile: uboProfile, link: uboLink },
      count: 1,
      pii: true,
    });
  }

  // Audit-anchor evidence (PII-free): a pointer to the witness anchor chain + its
  // OTS proof, so a holder can independently check the anchor against Bitcoin with
  // no ar-agents key in the trust path. Best-effort: the bundle is valid without it
  // (empty ledger / KV down). NEVER embed AUDIT_HMAC_SECRET.
  try {
    const head = await readHead();
    if (head) {
      const anchors = await readAnchors();
      const latest = anchors.length > 0 ? anchors[anchors.length - 1] ?? null : null;
      const proofs = latest ? await readAnchorProofs() : {};
      const otsProof = latest ? proofs[latest.seq] ?? null : null;
      sections.push({
        name: SECTION.auditAnchor,
        data: { ledgerHead: head, latestAnchor: latest, otsProof },
        count: 1,
        pii: false,
      });
    }
  } catch {
    // best-effort: anchor evidence is optional
  }

  return assembleBundle(id, generatedAt, includePii, sections);
}
