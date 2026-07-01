/**
 * Portability Bundle — the PURE core (build-independent verify + replay).
 *
 * A Bundle is a signed, self-describing export of one registry entity's state
 * that a third party can VERIFY and REPLAY with no dependency on ar-agents
 * infrastructure. The data state is portable so a conservative counterparty
 * trusts us with the entity's live operations; the live good-standing the market
 * reads is what stays with us.
 *
 * Shape: the bundle is an ATTESTATION document `{ body: manifest, sig, publicKey }`
 * (so the existing `arg-verify.mjs attestation` verb already verifies its
 * signature) PLUS a `sections` map. The signed MANIFEST binds a SHA-256 of each
 * section's canonical bytes, so one Ed25519 signature transitively covers all
 * section content and any tamper is detectable. Adding a whole section appends one
 * digest leaf and NEVER perturbs already-signed bytes (forward-compatible).
 *
 * PURITY CONTRACT: this module imports only `canonical006` (pure), the pure
 * `scoreEntry` (deterministic, type-only registry imports), Web Crypto, and
 * TYPE-ONLY registry types. It never touches KV/@vercel/kv, so verifyBundle /
 * replayBundle run anywhere. The KV-backed assembly is portability-bundle.ts; the
 * standalone dependency-free verifier is public/arg-portability.mjs.
 */

import { canonical006 } from "./canonical006";
import { scoreEntry, type ScoreInput, type ScoreResult } from "./good-standing-score";

export const BUNDLE_KIND = "ar-agents.portability.bundle.v1";
export const MANIFEST_KIND = "ar-agents.portability.manifest.v1";
export const BUNDLE_VERSION = 1;

/** Stable section names. Additive: new sections may be appended over time. */
export const SECTION = {
  record: "record",
  goodStanding: "goodStanding",
  history: "history",
  incidents: "incidents",
  uboStatus: "uboStatus",
  ubo: "ubo",
  railPosture: "railPosture",
  auditAnchor: "auditAnchor",
} as const;

export interface BundleSectionMeta {
  /** Section name (a key into `bundle.sections`). */
  name: string;
  /** Number of records in the section (1 for singletons, array length otherwise). */
  count: number;
  /** sha256 hex of canonical006(sectionData). */
  sha256: string;
  /** Whether this section carries PII (owner-gated on export). */
  pii: boolean;
}

export interface BundleManifest {
  kind: string;
  bundleVersion: number;
  entityId: string;
  /** ISO of when the bundle was assembled; also scoreEntry `now` for deterministic replay. */
  generatedAt: string;
  /** Whether PII sections are included in this export (the owner's full export). */
  includesPii: boolean;
  /** Section digests, sorted by name for deterministic signed bytes. */
  sections: BundleSectionMeta[];
}

export interface BundleSignature {
  /** Ed25519 over canonical006(manifest), STANDARD base64 (mirrors the oracle). */
  sig: string;
  /** STANDARD base64 SPKI public key. */
  publicKey: string;
  alg: "Ed25519";
}

export interface PortabilityBundle {
  kind: string;
  /** The signed manifest = the attestation "body". */
  body: BundleManifest;
  /** Detached Ed25519 attestation over `body` (absent if no signing key configured). */
  sig?: string;
  publicKey?: string;
  alg?: "Ed25519";
  /** section name -> section data. Each section's hash is committed in body.sections. */
  sections: Record<string, unknown>;
}

/** The goodStanding section shape (what buildBundle stores; replay re-derives from it). */
export interface GoodStandingSection {
  standing: unknown;
  input: ScoreInput;
  result: ScoreResult;
  issuedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Crypto helpers (Web Crypto; edge- + node-safe; STANDARD base64 to match oracle)
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const ED = { name: "Ed25519" } as unknown as AlgorithmIdentifier;

/** Tolerant base64 / base64url -> bytes. */
function b64ToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
  const bin = atob(b64 + "=".repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** bytes -> STANDARD base64 (with padding), matching the oracle's bytesToB64. */
function bytesToStdB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/** Normalize a base64/base64url string for comparison (strip padding + variant chars). */
function normB64(s: string): string {
  return s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
}

/**
 * Dense clone: JSON round-trip so no `undefined`-valued key or array hole ever
 * reaches canonical006 (which THROWS on them). This is exactly the shape a holder
 * gets after transporting the bundle as JSON, so hashing the dense form keeps the
 * signer and every verifier byte-identical.
 */
export function denseClone<T>(x: T): unknown {
  return x === undefined ? null : JSON.parse(JSON.stringify(x));
}

/** sha256 hex of a UTF-8 string. */
export async function sha256Hex(material: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(material));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The canonical section digest: sha256(canonical006(sectionData)). */
export async function sectionSha256(data: unknown): Promise<string> {
  return sha256Hex(canonical006(data));
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembly
// ─────────────────────────────────────────────────────────────────────────────

export interface SectionInput {
  name: string;
  data: unknown;
  count: number;
  pii: boolean;
}

/** Build the manifest (with section digests) + the dense section-data map. Deterministic. */
export async function buildManifest(
  entityId: string,
  generatedAt: string,
  includesPii: boolean,
  sections: SectionInput[],
): Promise<{ manifest: BundleManifest; sectionData: Record<string, unknown> }> {
  const metas: BundleSectionMeta[] = [];
  const sectionData: Record<string, unknown> = {};
  for (const s of sections) {
    // Dense-clone so canonical006 never meets an undefined member; hash + store the SAME bytes.
    const dense = denseClone(s.data);
    metas.push({ name: s.name, count: s.count, sha256: await sectionSha256(dense), pii: s.pii });
    sectionData[s.name] = dense;
  }
  // Sort by name so the signed manifest bytes are independent of build order.
  metas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const manifest: BundleManifest = {
    kind: MANIFEST_KIND,
    bundleVersion: BUNDLE_VERSION,
    entityId,
    generatedAt,
    includesPii,
    sections: metas,
  };
  return { manifest, sectionData };
}

/** Ed25519-sign a manifest over canonical006(manifest). Null if no key configured. */
export async function signManifest(
  manifest: BundleManifest,
  privateKeyPkcs8?: string,
  publicKeySpki?: string,
): Promise<BundleSignature | null> {
  const pkcs8 = privateKeyPkcs8 ?? process.env.AUDIT_ED25519_PRIVATE_KEY?.trim();
  const spki = publicKeySpki ?? process.env.AUDIT_ED25519_PUBLIC_KEY?.trim();
  if (!pkcs8 || !spki) return null;
  try {
    const key = await crypto.subtle.importKey("pkcs8", toArrayBuffer(b64ToBytes(pkcs8)), ED, false, ["sign"]);
    const sigBytes = await crypto.subtle.sign(ED, key, enc.encode(canonical006(manifest)));
    return {
      sig: bytesToStdB64(new Uint8Array(sigBytes)),
      publicKey: bytesToStdB64(b64ToBytes(spki)),
      alg: "Ed25519",
    };
  } catch {
    return null;
  }
}

/** Verify a detached manifest signature offline. */
export async function verifyManifestSig(
  manifest: BundleManifest,
  sig: string,
  publicKeySpki: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("spki", toArrayBuffer(b64ToBytes(publicKeySpki)), ED, false, ["verify"]);
    return await crypto.subtle.verify(ED, key, toArrayBuffer(b64ToBytes(sig)), enc.encode(canonical006(manifest)));
  } catch {
    return false;
  }
}

/** Assemble a complete, signed bundle from section inputs. */
export async function assembleBundle(
  entityId: string,
  generatedAt: string,
  includesPii: boolean,
  sections: SectionInput[],
  opts?: { privateKeyPkcs8?: string; publicKeySpki?: string },
): Promise<PortabilityBundle> {
  const { manifest, sectionData } = await buildManifest(entityId, generatedAt, includesPii, sections);
  const signed = await signManifest(manifest, opts?.privateKeyPkcs8, opts?.publicKeySpki);
  return {
    kind: BUNDLE_KIND,
    body: manifest,
    ...(signed ? { sig: signed.sig, publicKey: signed.publicKey, alg: signed.alg } : {}),
    sections: sectionData,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification (PURE — runs anywhere, no KV)
// ─────────────────────────────────────────────────────────────────────────────

export interface BundleVerification {
  /** INTEGRITY: the bundle is internally self-consistent (sections match the signed
   * manifest AND the manifest signature verifies against the bundle's OWN key).
   * This does NOT prove ar-agents issued it — see `authenticity`. */
  ok: boolean;
  structural: boolean;
  sectionIntegrity: boolean;
  signaturePresent: boolean;
  /** The manifest signature verifies against the bundle's EMBEDDED public key. */
  signatureValid: boolean;
  /**
   * AUTHENTICITY — did ar-agents issue this?
   *  - "confirmed": a public key was pinned and it matches + the signature verifies.
   *  - "self-consistent-unpinned": the signature verifies against the bundle's own
   *     key, but NO key was pinned, so anyone could have signed it. NOT proof of issuer.
   *  - "failed": unsigned, invalid signature, or pinned-key mismatch.
   * A trusting consumer MUST require "confirmed" (pass `pinnedPublicKey`).
   */
  authenticity: "confirmed" | "self-consistent-unpinned" | "failed";
  entityConsistent: boolean;
  checkedSections: number;
  /** Section names present in the bundle but not covered by the signed manifest. */
  unknownSections: string[];
  reasons: string[];
}

export interface VerifyOpts {
  /** Fail if the bundle is unsigned (default true — a PII bundle must be signed). */
  requireSignature?: boolean;
  /**
   * The ar-agents public key, pinned out-of-band (published at
   * /.well-known/sociedad-ia/keys). REQUIRED to establish AUTHENTICITY: without it
   * a valid signature only proves self-consistency, because an attacker can re-sign
   * a tampered bundle with their own key. When set, the bundle's key must match.
   */
  pinnedPublicKey?: string;
}

export async function verifyBundle(bundle: PortabilityBundle, opts?: VerifyOpts): Promise<BundleVerification> {
  const requireSignature = opts?.requireSignature ?? true;
  const reasons: string[] = [];
  const empty: BundleVerification = {
    ok: false,
    structural: false,
    sectionIntegrity: false,
    signaturePresent: false,
    signatureValid: false,
    authenticity: "failed",
    entityConsistent: false,
    checkedSections: 0,
    unknownSections: [],
    reasons,
  };

  if (!bundle || typeof bundle !== "object") {
    reasons.push("bundle is not an object");
    return empty;
  }
  const structural = bundle.kind === BUNDLE_KIND;
  if (!structural) reasons.push(`unexpected bundle kind "${bundle.kind}"`);

  const manifest = bundle.body;
  if (!manifest || manifest.kind !== MANIFEST_KIND || !Array.isArray(manifest.sections)) {
    reasons.push("missing or invalid manifest");
    return { ...empty, structural };
  }

  const sections: Record<string, unknown> =
    bundle.sections && typeof bundle.sections === "object" ? bundle.sections : {};

  // Section integrity: every DECLARED section must be present and hash-match.
  let sectionIntegrity = true;
  let checked = 0;
  for (const meta of manifest.sections) {
    const data = sections[meta.name];
    if (data === undefined) {
      sectionIntegrity = false;
      reasons.push(`declared section "${meta.name}" missing from bundle`);
      continue;
    }
    const h = await sectionSha256(data);
    checked++;
    if (h !== meta.sha256) {
      sectionIntegrity = false;
      reasons.push(`section "${meta.name}" hash mismatch (tampered)`);
    }
  }
  // No UNDECLARED sections: data not covered by the signed manifest is smuggled.
  const unknownSections: string[] = [];
  for (const name of Object.keys(sections)) {
    if (!manifest.sections.some((m) => m.name === name)) {
      unknownSections.push(name);
      sectionIntegrity = false;
      reasons.push(`undeclared section "${name}" not covered by the signed manifest`);
    }
  }

  // Signature over the manifest (which commits to all section hashes). We verify
  // against the bundle's EMBEDDED key (self-consistency) AND, separately, whether
  // that key matches a pinned ar-agents key (authenticity). An attacker can re-sign
  // a tampered bundle with THEIR OWN key, so a valid unpinned signature proves only
  // self-consistency, never issuer.
  const signaturePresent = Boolean(bundle.sig && bundle.publicKey);
  const pinSupplied = Boolean(opts?.pinnedPublicKey);
  const pinMatches =
    pinSupplied && signaturePresent && normB64(opts!.pinnedPublicKey as string) === normB64(bundle.publicKey as string);
  let signatureValid = false;
  if (signaturePresent) {
    signatureValid = await verifyManifestSig(manifest, bundle.sig as string, bundle.publicKey as string);
    if (!signatureValid) reasons.push("manifest signature does not verify");
  } else if (requireSignature) {
    reasons.push("signature required but the bundle is unsigned");
  }
  if (pinSupplied && signaturePresent && !pinMatches) {
    reasons.push("bundle public key does not match the pinned key (authenticity not established)");
  }

  let authenticity: BundleVerification["authenticity"];
  if (!signaturePresent || !signatureValid) authenticity = "failed";
  else if (pinSupplied) authenticity = pinMatches ? "confirmed" : "failed";
  else authenticity = "self-consistent-unpinned";

  // Entity consistency: the record section's id must equal the manifest entityId.
  let entityConsistent = true;
  const rec = sections[SECTION.record];
  if (rec && typeof rec === "object") {
    const recId = (rec as { id?: unknown }).id;
    if (typeof recId === "string" && recId !== manifest.entityId) {
      entityConsistent = false;
      reasons.push("record.id does not match manifest.entityId");
    }
  }

  const signatureOk = signaturePresent ? signatureValid && (!pinSupplied || pinMatches) : !requireSignature;
  const ok = structural && sectionIntegrity && entityConsistent && signatureOk;
  return {
    ok,
    structural,
    sectionIntegrity,
    signaturePresent,
    signatureValid,
    authenticity,
    entityConsistent,
    checkedSections: checked,
    unknownSections,
    reasons,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Replay (PURE — reconstruct essential registry state from a verified bundle)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplayState {
  entityId: string;
  name: string | null;
  status: string | null;
  source: string | null;
  goodStanding: {
    state: string | null;
    /** The good-standing composite RE-DERIVED from the bundle (proves reconstruction). */
    score: number | null;
    rating: string | null;
    /** Whether the re-derived verdict matches the one stored in the bundle. */
    reDerivedMatches: boolean;
  };
  historyCount: number;
  incidentCount: number;
  openIncidentCount: number;
  hasUbo: boolean;
  uboBankable: boolean | null;
  railPosture: unknown;
  includesPii: boolean;
  generatedAt: string;
}

export interface ReplayResult {
  ok: boolean;
  verification: BundleVerification;
  state: ReplayState | null;
  reasons: string[];
}

/**
 * Verify a bundle, then reconstruct the essential registry state a fresh stack
 * would need to mirror the entity. The good-standing verdict is RE-DERIVED with
 * the pure scoreEntry (deterministic at the bundle's generatedAt), which is the
 * literal "reconstruct the verdict off our infra" proof. Reconstruction only
 * proceeds on a verified bundle, so the state is exactly what the signature covers.
 */
export async function replayBundle(bundle: PortabilityBundle, opts?: VerifyOpts): Promise<ReplayResult> {
  const verification = await verifyBundle(bundle, opts);
  if (!verification.ok) {
    return { ok: false, verification, state: null, reasons: verification.reasons };
  }
  const s: Record<string, unknown> = bundle.sections ?? {};
  const rec = (s[SECTION.record] ?? {}) as {
    name?: string;
    status?: string;
    source?: string;
    goodStanding?: { state?: string };
  };
  const gs = (s[SECTION.goodStanding] ?? {}) as Partial<GoodStandingSection>;
  const history = Array.isArray(s[SECTION.history]) ? (s[SECTION.history] as unknown[]) : [];
  const incidents = Array.isArray(s[SECTION.incidents])
    ? (s[SECTION.incidents] as Array<{ resolvedAt?: string }>)
    : [];
  const uboStatus = s[SECTION.uboStatus] as { bankable?: boolean } | undefined;

  // RE-DERIVE good-standing from the bundle's own inputs at its generatedAt.
  let reDerived: ScoreResult | null = null;
  let reDerivedMatches = false;
  if (gs.input) {
    const nowMs = Date.parse(bundle.body.generatedAt);
    reDerived = scoreEntry(gs.input, Number.isFinite(nowMs) ? { now: nowMs } : undefined);
    reDerivedMatches = gs.result ? canonical006(reDerived) === canonical006(gs.result) : false;
  }

  const state: ReplayState = {
    entityId: bundle.body.entityId,
    name: rec.name ?? null,
    status: rec.status ?? null,
    source: rec.source ?? null,
    goodStanding: {
      state: gs.input?.state ?? rec.goodStanding?.state ?? null,
      score: reDerived?.overall ?? null,
      rating: reDerived?.rating ?? null,
      reDerivedMatches,
    },
    historyCount: history.length,
    incidentCount: incidents.length,
    openIncidentCount: incidents.filter((i) => !i.resolvedAt).length,
    hasUbo: uboStatus !== undefined,
    uboBankable: uboStatus && typeof uboStatus.bankable === "boolean" ? uboStatus.bankable : null,
    railPosture: s[SECTION.railPosture] ?? null,
    includesPii: bundle.body.includesPii,
    generatedAt: bundle.body.generatedAt,
  };
  return { ok: true, verification, state, reasons: verification.reasons };
}
