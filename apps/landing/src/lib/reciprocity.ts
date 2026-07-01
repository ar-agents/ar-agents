/**
 * RFC-003 reciprocity — the receiving side of cross-jurisdiction portability.
 *
 * A Portability Bundle is the transport (a signed, replayable export of an
 * entity's registry state). Reciprocity is what a RECEIVING jurisdiction does with
 * one: verify it is AUTHENTIC (issued by ar-agents, not merely self-consistent),
 * reconstruct the entity's state off-infra, and map it into a portable, globally
 * readable credit file it can honor. This is the North Star made concrete: an
 * entity's good standing travels with it across jurisdictions.
 *
 * PURE: builds only on the pure portability-bundle core. A receiving stack (or a
 * regulator) can import this with no ar-agents infrastructure.
 *
 * TRUST: acceptance REQUIRES authenticity === "confirmed", i.e. the caller MUST
 * pin the ar-agents public key (published at /.well-known/sociedad-ia/keys). An
 * unpinned or forged bundle is rejected, never accepted on self-consistency alone.
 */

import {
  replayBundle,
  SECTION,
  type PortabilityBundle,
  type BundleVerification,
} from "./portability-bundle-core";

/** The jurisdiction-portable credit file a receiving stack honors. PII-free. */
export interface PortableCreditFile {
  entityId: string;
  name: string | null;
  sourceJurisdiction: string | null;
  goodStanding: { state: string | null; score: number | null; rating: string | null };
  /** custodial | ubo_controlled | null — the sovereignty tier. */
  keyPosture: string | null;
  railPosture: unknown;
  bankable: boolean | null;
  incidentCount: number;
  openIncidentCount: number;
  historyDepth: number;
  /** The bundle's generatedAt — how fresh this credit file is. */
  asOf: string;
}

export interface ReciprocityAcceptance {
  kind: "ar-agents.reciprocity.acceptance.v1";
  accepted: boolean;
  targetJurisdiction: string;
  sourceJurisdiction: string | null;
  entityId: string | null;
  authenticity: BundleVerification["authenticity"];
  portableCreditFile: PortableCreditFile | null;
  /** The fields the receiving jurisdiction accepted into the credit file. */
  acceptedFields: string[];
  reasons: string[];
}

export interface AcceptOpts {
  /** REQUIRED: the pinned ar-agents public key. Without it, acceptance fails. */
  pinnedPublicKey: string;
  targetJurisdiction: string;
}

/**
 * Evaluate a Portability Bundle for reciprocity into `targetJurisdiction`. Accepts
 * only when the bundle is authentic (pinned + valid) AND replays cleanly; then it
 * emits the portable credit file the receiving jurisdiction honors.
 */
export async function buildAcceptance(
  bundle: PortabilityBundle,
  opts: AcceptOpts,
): Promise<ReciprocityAcceptance> {
  const replay = await replayBundle(bundle, {
    requireSignature: true,
    pinnedPublicKey: opts.pinnedPublicKey,
  });
  const authenticity = replay.verification.authenticity;
  const reasons = [...replay.verification.reasons];

  const record = (bundle.sections?.[SECTION.record] ?? {}) as {
    jurisdiction?: string;
    keyPosture?: { mode?: string };
  };
  const sourceJurisdiction = typeof record.jurisdiction === "string" ? record.jurisdiction : null;

  // Accept ONLY on confirmed authenticity + a clean replay.
  const accepted = replay.ok && authenticity === "confirmed";
  if (!accepted) {
    if (authenticity !== "confirmed") {
      reasons.push("reciprocity denied: bundle authenticity not confirmed (pin the ar-agents key)");
    }
    return {
      kind: "ar-agents.reciprocity.acceptance.v1",
      accepted: false,
      targetJurisdiction: opts.targetJurisdiction,
      sourceJurisdiction,
      entityId: replay.state?.entityId ?? bundle.body?.entityId ?? null,
      authenticity,
      portableCreditFile: null,
      acceptedFields: [],
      reasons,
    };
  }

  const st = replay.state!;
  const portableCreditFile: PortableCreditFile = {
    entityId: st.entityId,
    name: st.name,
    sourceJurisdiction,
    goodStanding: st.goodStanding,
    keyPosture: record.keyPosture?.mode ?? null,
    railPosture: st.railPosture,
    bankable: st.uboBankable,
    incidentCount: st.incidentCount,
    openIncidentCount: st.openIncidentCount,
    historyDepth: st.historyCount,
    asOf: st.generatedAt,
  };

  return {
    kind: "ar-agents.reciprocity.acceptance.v1",
    accepted: true,
    targetJurisdiction: opts.targetJurisdiction,
    sourceJurisdiction,
    entityId: st.entityId,
    authenticity,
    portableCreditFile,
    acceptedFields: [
      "goodStanding",
      "keyPosture",
      "railPosture",
      "bankable",
      "incidents",
      "history",
    ],
    reasons,
  };
}
