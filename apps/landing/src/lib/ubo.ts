/**
 * UBO (Ultimate Beneficial Owner) primitive.
 *
 * A bankable automated company needs a legible controller: who is ultimately
 * responsible. This module models a `UBOProfile` (the identity) and a signed
 * `UBOLink` attestation (binds entityId <-> ubo <-> verificationMethod <->
 * verifiedAt/expiresAt with an Ed25519 signature, offline-verifiable with the same
 * `arg-verify attestation` verb as the rest of the system). The `bankable`
 * predicate encodes what a bank/PSP needs before it will transact.
 *
 * PHASE 1 (now): SELF-ATTESTED ONLY. The declarant asserts the UBO; we sign the
 * link at trust level 0. Self-attested is explicitly NOT bankable.
 *
 * REGULATED GUARDRAIL (HARD): authoritative verification (Renaper / AFIP padron /
 * external KYC, levels 1-2) is a REGULATED activity (data controller under Ley
 * 25.326; possible AML obligated subject). Those verifiers are STUBBED here and
 * gated on a real legal scoping. Do NOT wire a live KYC provider without that.
 *
 * PII posture: the profile (legal name, gov id) is sensitive. It is served only on
 * ADMIN/authenticated surfaces. The public oracle gets `getUboStatus` (PII-FREE:
 * presence + level + method + bankable + verifiedAt), never the name or gov id.
 *
 * KV-backed with in-memory fallback + best-effort, mirroring registry-store; the
 * signing is edge-safe Web Crypto so the oracle route can import getUboStatus.
 */

import { kv } from "@vercel/kv";

export type GovIdType = "CUIL" | "CUIT" | "passport" | "other";
export type UBOVerificationMethod = "self-attested" | "renaper" | "afip" | "external-kyc";

/** Trust level of a UBOLink: 0 self-attested, 1 document-checked, 2 authoritative. */
export type UBOLevel = 0 | 1 | 2;

export interface UBOProfile {
  id: string;
  legalName: string;
  govId: { type: GovIdType; value: string };
  /** ISO country of the controller (e.g. "AR"). */
  jurisdiction: string;
  contact?: { email?: string };
  createdAt: string;
}

export interface UBOLink {
  entityId: string;
  uboId: string;
  verificationMethod: UBOVerificationMethod;
  level: UBOLevel;
  verifiedAt: string;
  expiresAt?: string;
  /** Ed25519 over canonical(link-core), standard base64. Present when signed. */
  sig?: string;
  publicKey?: string;
  alg?: "Ed25519";
}

/** The minimum link level a bank/PSP requires to treat the UBO as sufficient. */
export const MIN_BANKABLE_LEVEL: UBOLevel = 2;

// ── storage (KV + in-memory fallback) ──────────────────────────────────────────

const KEY_PROFILE = (entityId: string) => `registry:ubo:profile:${entityId}`;
const KEY_LINK = (entityId: string) => `registry:ubo:link:${entityId}`;
const memProfiles = new Map<string, UBOProfile>();
const memLinks = new Map<string, UBOLink>();

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

async function readProfile(entityId: string): Promise<UBOProfile | null> {
  if (!isKvWired()) return memProfiles.get(entityId) ?? null;
  try {
    return (await kv.get<UBOProfile>(KEY_PROFILE(entityId))) ?? null;
  } catch {
    return null;
  }
}

async function readLink(entityId: string): Promise<UBOLink | null> {
  if (!isKvWired()) return memLinks.get(entityId) ?? null;
  try {
    return (await kv.get<UBOLink>(KEY_LINK(entityId))) ?? null;
  } catch {
    return null;
  }
}

// ── Ed25519 signing (edge-safe; same format as the oracle + arg-verify) ─────────

const enc = new TextEncoder();

function canonical(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) throw new TypeError("canonical: non-finite");
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
  const bin = atob(b64 + "=".repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/** The signed core of a UBOLink (no signature fields). Key-sorted canonical. */
function linkCore(link: Omit<UBOLink, "sig" | "publicKey" | "alg">): Record<string, unknown> {
  return {
    kind: "ar-agents.ubo.link",
    entityId: link.entityId,
    uboId: link.uboId,
    verificationMethod: link.verificationMethod,
    level: link.level,
    verifiedAt: link.verifiedAt,
    ...(link.expiresAt ? { expiresAt: link.expiresAt } : {}),
  };
}

/** The canonical signed core of a UBOLink, for OFFLINE verification (recompute
 * canonical(uboLinkCore(link)) and verify link.sig with link.publicKey). */
export function uboLinkCore(link: UBOLink): Record<string, unknown> {
  return linkCore(link);
}

async function signLink(
  core: Omit<UBOLink, "sig" | "publicKey" | "alg">,
): Promise<{ sig: string; publicKey: string } | null> {
  const pkcs8 = process.env.AUDIT_ED25519_PRIVATE_KEY?.trim();
  const spki = process.env.AUDIT_ED25519_PUBLIC_KEY?.trim();
  if (!pkcs8 || !spki) return null;
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      toArrayBuffer(b64urlToBytes(pkcs8)),
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      false,
      ["sign"],
    );
    const sigBytes = await crypto.subtle.sign(
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      key,
      enc.encode(canonical(linkCore(core))),
    );
    return { sig: bytesToB64(new Uint8Array(sigBytes)), publicKey: bytesToB64(b64urlToBytes(spki)) };
  } catch {
    return null;
  }
}

// ── writes ──────────────────────────────────────────────────────────────────────

/** Set (replace) the controlling UBO profile for an entity. Admin-only surface. */
export async function setUboProfile(
  entityId: string,
  input: { legalName: string; govId: { type: GovIdType; value: string }; jurisdiction: string; contact?: { email?: string }; now?: string },
): Promise<UBOProfile | null> {
  if (!entityId) return null;
  const profile: UBOProfile = {
    id: crypto.randomUUID(),
    legalName: input.legalName.slice(0, 200),
    govId: { type: input.govId.type, value: input.govId.value.slice(0, 40) },
    jurisdiction: input.jurisdiction.slice(0, 8),
    ...(input.contact?.email ? { contact: { email: input.contact.email.slice(0, 200) } } : {}),
    createdAt: input.now ?? new Date().toISOString(),
  };
  if (!isKvWired()) {
    memProfiles.set(entityId, profile);
    return profile;
  }
  try {
    await kv.set(KEY_PROFILE(entityId), profile);
    return profile;
  } catch {
    return null;
  }
}

/** Raised when a caller asks for an authoritative-verification method (levels 1-2). */
export class UboVerificationNotAvailableError extends Error {
  constructor() {
    super("ubo_verification_not_available");
    this.name = "UboVerificationNotAvailableError";
  }
}

/**
 * Create + sign a UBOLink for the entity's stored profile. PHASE 1: only
 * `self-attested` is allowed (level 0). Any authoritative method throws
 * UboVerificationNotAvailableError (the regulated verifier is not wired).
 */
export async function linkUbo(
  entityId: string,
  method: UBOVerificationMethod = "self-attested",
  opts?: { expiresAt?: string; now?: string },
): Promise<UBOLink | null> {
  if (method !== "self-attested") {
    // Regulated: authoritative verification requires a legal-scoping gate + a
    // real provider. Not wired. Fail loud so no path silently fakes a high level.
    throw new UboVerificationNotAvailableError();
  }
  const profile = await readProfile(entityId);
  if (!profile) return null; // need a profile first
  const core: Omit<UBOLink, "sig" | "publicKey" | "alg"> = {
    entityId,
    uboId: profile.id,
    verificationMethod: "self-attested",
    level: 0,
    verifiedAt: opts?.now ?? new Date().toISOString(),
    ...(opts?.expiresAt ? { expiresAt: opts.expiresAt } : {}),
  };
  const signed = await signLink(core);
  const link: UBOLink = { ...core, ...(signed ? { ...signed, alg: "Ed25519" } : {}) };
  if (!isKvWired()) {
    memLinks.set(entityId, link);
    return link;
  }
  try {
    await kv.set(KEY_LINK(entityId), link);
    return link;
  } catch {
    return null;
  }
}

// ── reads / predicates ──────────────────────────────────────────────────────────

export async function getUboProfile(entityId: string): Promise<UBOProfile | null> {
  return readProfile(entityId);
}
export async function getUboLink(entityId: string): Promise<UBOLink | null> {
  return readLink(entityId);
}

export interface BankableResult {
  bankable: boolean;
  level: UBOLevel | null;
  reasons: string[];
}

/** Pure bankable evaluation over an already-read profile + link. */
function evaluateBankable(profile: UBOProfile | null, link: UBOLink | null): BankableResult {
  const reasons: string[] = [];
  if (!profile) reasons.push("no UBO profile on file");
  if (!link) reasons.push("no UBO link on file");
  const level = link?.level ?? null;
  const expired = Boolean(link?.expiresAt && Date.parse(link.expiresAt) < Date.now());
  if (link && link.level < MIN_BANKABLE_LEVEL) {
    reasons.push(
      `UBO verification level ${link.level} is below the bankable minimum ${MIN_BANKABLE_LEVEL} (self-attested is not sufficient; authoritative verification is not yet available)`,
    );
  }
  if (expired) reasons.push("UBO link expired");
  const bankable = Boolean(profile && link && link.level >= MIN_BANKABLE_LEVEL && !expired);
  return { bankable, level, reasons };
}

/**
 * The predicate a bank/PSP evaluates. Requires a defined profile AND a link at
 * level >= MIN_BANKABLE_LEVEL. Phase-1 self-attested links are level 0, so this
 * returns bankable:false HONESTLY until authoritative verification exists.
 */
export async function bankablePredicate(entityId: string): Promise<BankableResult> {
  const [profile, link] = await Promise.all([readProfile(entityId), readLink(entityId)]);
  return evaluateBankable(profile, link);
}

/** PII-FREE status for the PUBLIC oracle: presence + level + method + bankable.
 * Exactly two KV reads (profile + link) since this is called on the hot path. */
export async function getUboStatus(
  entityId: string,
): Promise<{ present: boolean; level: UBOLevel | null; method: UBOVerificationMethod | null; verifiedAt: string | null; bankable: boolean } | null> {
  const [profile, link] = await Promise.all([readProfile(entityId), readLink(entityId)]);
  if (!link && !profile) return null;
  const bank = evaluateBankable(profile, link);
  return {
    present: Boolean(profile),
    level: link?.level ?? null,
    method: link?.verificationMethod ?? null,
    verifiedAt: link?.verifiedAt ?? null,
    bankable: bank.bankable,
  };
}

/** Test-only: clear the in-memory fallback stores. */
export function __resetUboForTests(): void {
  memProfiles.clear();
  memLinks.clear();
}
