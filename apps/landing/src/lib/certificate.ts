/**
 * Sprint 2 · Part B — the certifier-with-teeth.
 *
 * Turns the EPHEMERAL /api/certifier score-scan into a SIGNED, LISTED, REVOCABLE
 * Certificate: a dereferenceable JSON document a counterparty (or a README badge)
 * can link to and trust without re-running the scan, and that the issuer can
 * REVOKE (the "teeth") so a once-good operator who lapses is visibly de-certified.
 *
 * TRUST MODEL (CAPTURE-TRANSFORMATION tesis #2):
 *  - The ar-agents Ed25519 signature over the certificate body is CONVENIENCE: it
 *    lets a caller confirm the cert came from us and was not altered, verifiable
 *    OFFLINE with arg-verify.mjs (no secret, public key at /.well-known/...keys).
 *  - The LOAD-BEARING trust-minimization is the SUBJECT's own publicly-anchored
 *    attestation (OpenTimestamps → Bitcoin) + the witness anchor chain. So the
 *    certificate FORWARDS those pointers in `attestationRef` rather than asking
 *    the caller to trust an AR key. See attestation.ts (body.timestamp), ledger.ts
 *    (anchor chain), and /api/audit/anchor/<seq>/ots (the raw .ots proof).
 *
 * Signing is byte-identical to lib/attestation.ts: Ed25519 over canonical006(body),
 * `sig`/`publicKey` as STANDARD base64, so the same offline verifier that checks a
 * `vultur.compliance.attestation` (`arg-verify attestation`) verifies a certificate
 * by mirroring that verb (the `certificate` verb extends arg-verify.mjs in Part C).
 *
 * Storage: Vercel KV (Upstash, sa-east-1), with an in-memory fallback for local
 * dev — same isKvWired/fallback pattern as conformance-history + capability-token.
 */

import { kv } from "@vercel/kv";
import { canonical006 } from "./ledger";

// ── public surface constants ────────────────────────────────────────────────

const SITE = "https://ar-agents.ar";

/** keyId of the published Ed25519 key (/.well-known/sociedad-ia/keys). Reused for
 * the cert signature per the Sprint-2 design call (sig = convenience, tesis #2). */
export const CERT_KEY_ID = "ar-agents-ref-2026-05";

/** Minimum certifier rating a subject must hit for a cert to be issuable. */
export const MIN_RATING: CertRating = "C";
const MIN_SCORE = 60; // C threshold, matches /api/certifier ratingFromScore.

/** Default validity window for a freshly-issued certificate. */
const DEFAULT_TTL_DAYS = 90;

// KV layout. Cert json per id, a set of all ids (bounded), and a by-url index to
// the LATEST cert for an origin (so a badge can resolve "the current cert").
const CERT_KEY = (certId: string) => `cert:${certId}`;
const CERT_LIST_KEY = "cert:list";
const CERT_BY_URL_KEY = (origin: string) => `cert:by-url:${b64url(origin)}`;
/** Bound the id set so abuse can't grow KV unboundedly (mirrors ratelimit MAX_BUCKETS). */
const MAX_CERTS = 5000;

// ── shapes ───────────────────────────────────────────────────────────────────

export type CertRating = "A" | "B" | "C" | "D" | "F" | "N/A";
export type CertStatus = "valid" | "revoked" | "expired";

/** The trust-minimized link: pointers to the SUBJECT's own publicly-anchored
 * attestation + witness chain + the offline-verify recipe. The cert does NOT
 * embed the anchor (it can upgrade pending→bitcoin out of band); it points at it. */
export interface CertAttestationRef {
  /** "convenience" per tesis #2: the ar-agents sig is not the trust root. */
  note: string;
  /** The subject's own per-session attestation (Ed25519 + optional OTS timestamp). */
  attestationUrl: string | null;
  /** The global witness anchor chain (anyone can retain an anchor → tamper-evidence). */
  anchorChainUrl: string;
  /** Where to fetch the raw OpenTimestamps .ots proof for an anchor seq. */
  anchorOtsUrlTemplate: string;
  /** Offline-verify recipe a counterparty runs without trusting ar-agents. */
  verify: {
    offline: string;
    publicKeyUrl: string;
    timestampHowto: string;
  };
}

/** Summary slice of a certification.v1 report bound into the cert. */
export interface CertReportSummary {
  score: number;
  rating: CertRating;
  rfcConformance: {
    "rfc-002-v1": "pass" | "partial" | "fail" | "skip";
    "rfc-004-draft": "pass" | "partial" | "fail" | "skip";
  };
}

/** The signed body — everything the Ed25519 signature covers (canonical006). */
export interface CertificateBody {
  $schema: string;
  kind: "ar-agents.certificate";
  version: 1;
  certId: string;
  issuedAt: string;
  expiresAt: string;
  subject: {
    baseUrl: string;
    registryId?: string;
    operator?: string;
    jurisdiction?: string;
  };
  certifierReport: CertReportSummary;
  attestationRef: CertAttestationRef;
  /** status + revocation live in the body so they are signed at issue time;
   * a later revoke RE-SIGNS the body (the stored doc always carries a sig that
   * matches its current status). `expired` is recomputed at read, not re-signed. */
  status: CertStatus;
  revocation?: { at: string; reason: string; by: "owner" | "admin" };
}

/** The stored / served document: signed body + detached signature material. */
export interface Certificate extends CertificateBody {
  /** Ed25519 over canonical006(body-without-signature-fields), STANDARD base64. */
  signature: string;
  /** Alias kept for arg-verify parity with the attestation shape ({body,sig}). */
  sig: string;
  /** SPKI public key, STANDARD base64 (same as attestation.publicKey). */
  publicKey: string;
  keyId: string;
  alg: "Ed25519";
}

// ── base64 / encoding helpers (Edge-safe, mirror attestation.ts) ─────────────

const enc = new TextEncoder();

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
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/** base64url of a UTF-8 string (KV-key-safe; matches conformance-history urlKey). */
function b64url(s: string): string {
  return bytesToB64(enc.encode(s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ── Ed25519 key import (cached per-secret, mirror attestation.ts) ────────────

const privCache: { key: CryptoKey | null; pkcs8: string | null } = { key: null, pkcs8: null };

async function privateKey(): Promise<CryptoKey | null> {
  const pkcs8 = process.env.AUDIT_ED25519_PRIVATE_KEY?.trim();
  if (!pkcs8) return null;
  if (privCache.key && privCache.pkcs8 === pkcs8) return privCache.key;
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      toArrayBuffer(b64urlToBytes(pkcs8)),
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      false,
      ["sign"],
    );
    privCache.key = key;
    privCache.pkcs8 = pkcs8;
    return key;
  } catch {
    return null;
  }
}

/** SPKI public key as STANDARD base64 (arg-verify reads attestation.publicKey with base64). */
function publicKeyB64(): string | null {
  const spki = process.env.AUDIT_ED25519_PUBLIC_KEY?.trim();
  if (!spki) return null;
  return bytesToB64(b64urlToBytes(spki));
}

/**
 * The EXACT object the Ed25519 signature covers: the CertificateBody, i.e. a
 * served Certificate minus the four detached-signature fields (signature, sig,
 * publicKey, keyId, alg). An offline verifier reconstructs this same object from
 * the served document, canonical006()s it, and Ed25519-verifies against `sig` +
 * `publicKey` — exactly how arg-verify's `certificate` verb (Part C) checks it.
 *
 * Exported so the test (and arg-verify) recompute byte-identical signing bytes.
 */
export function certificateSignedBody(cert: Certificate | CertificateBody): CertificateBody {
  const c = cert as Certificate;
  const body: CertificateBody = {
    $schema: c.$schema,
    kind: c.kind,
    version: c.version,
    certId: c.certId,
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
    subject: c.subject,
    certifierReport: c.certifierReport,
    attestationRef: c.attestationRef,
    status: c.status,
  };
  if (c.revocation) body.revocation = c.revocation;
  return body;
}

/**
 * Sign over canonical006(body). The signature covers EVERYTHING in
 * CertificateBody (status + revocation included), so a revoke that flips status
 * produces a fresh, internally-consistent signature.
 */
async function signBody(body: CertificateBody): Promise<{ sig: string; publicKey: string } | null> {
  const key = await privateKey();
  const pub = publicKeyB64();
  if (!key || !pub) return null;
  const sigBytes = await crypto.subtle.sign(
    { name: "Ed25519" } as unknown as AlgorithmIdentifier,
    key,
    enc.encode(canonical006(body)),
  );
  return { sig: bytesToB64(new Uint8Array(sigBytes)), publicKey: pub };
}

// ── KV plumbing (in-memory fallback) ─────────────────────────────────────────

const memCerts = new Map<string, Certificate>();
const memList = new Set<string>();
const memByUrl = new Map<string, string>();

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

async function readCert(certId: string): Promise<Certificate | null> {
  if (isKvWired()) {
    try {
      return (await kv.get<Certificate>(CERT_KEY(certId))) ?? null;
    } catch {
      // fall through to memory
    }
  }
  return memCerts.get(certId) ?? null;
}

async function writeCert(cert: Certificate, opts?: { isNew?: boolean }): Promise<void> {
  if (isKvWired()) {
    try {
      await kv.set(CERT_KEY(cert.certId), cert);
      if (opts?.isNew) await kv.sadd(CERT_LIST_KEY, cert.certId);
      await kv.set(CERT_BY_URL_KEY(cert.subject.baseUrl), cert.certId);
      return;
    } catch {
      // fall through to memory
    }
  }
  memCerts.set(cert.certId, cert);
  if (opts?.isNew) memList.add(cert.certId);
  memByUrl.set(cert.subject.baseUrl, cert.certId);
}

async function listIds(): Promise<string[]> {
  if (isKvWired()) {
    try {
      const ids = await kv.smembers(CERT_LIST_KEY);
      if (Array.isArray(ids)) return ids.map(String);
    } catch {
      // fall through
    }
  }
  return Array.from(memList);
}

async function listSize(): Promise<number> {
  if (isKvWired()) {
    try {
      return (await kv.scard(CERT_LIST_KEY)) ?? 0;
    } catch {
      // fall through
    }
  }
  return memList.size;
}

// ── expiry (recomputed at READ; never trusts a stale stored status) ──────────

/** Returns the cert with `status` recomputed: a non-revoked cert past expiresAt
 * reads as "expired". Pure — does NOT re-sign (expiry is a function of the clock,
 * not a signed assertion); the signature still verifies over the issued body. */
export function withRecomputedStatus(cert: Certificate, now = Date.now()): Certificate {
  if (cert.status === "revoked") return cert;
  const expired = Date.parse(cert.expiresAt) <= now;
  if (expired && cert.status !== "expired") return { ...cert, status: "expired" };
  if (!expired && cert.status === "expired") return { ...cert, status: "valid" };
  return cert;
}

// ── attestationRef builder (the trust-minimized FORWARD) ─────────────────────

function buildAttestationRef(registryId: string | undefined): CertAttestationRef {
  // The subject's own per-session attestation lives at /api/audit/<slug>/attestation;
  // for a registry entry the slug is its registryId. Null when we don't know a slug.
  const attestationUrl = registryId
    ? `${SITE}/api/audit/${encodeURIComponent(registryId)}/attestation`
    : null;
  return {
    note:
      "The ar-agents Ed25519 signature on this certificate is a CONVENIENCE check (it confirms origin + integrity, verifiable offline with no secret). The load-bearing trust-minimization is the SUBJECT's own publicly-anchored attestation (OpenTimestamps → Bitcoin) + the witness anchor chain, forwarded below. Verify those, not an AR key.",
    attestationUrl,
    anchorChainUrl: `${SITE}/api/audit/anchor`,
    anchorOtsUrlTemplate: `${SITE}/api/audit/anchor/{seq}/ots`,
    verify: {
      offline: "node arg-verify.mjs certificate cert.json",
      publicKeyUrl: `${SITE}/.well-known/sociedad-ia/keys`,
      timestampHowto:
        "curl -s https://ar-agents.ar/api/audit/anchor/<seq>/ots -o anchor.ots && node arg-verify.mjs timestamp anchor.ots --digest <digest> && ots verify anchor.ots",
    },
  };
}

// ── id minting ───────────────────────────────────────────────────────────────

function newCertId(): string {
  // cert_<32 hex> — unguessable, collision-free in practice (mirrors gate/admin token entropy).
  return `cert_${crypto.randomUUID().replace(/-/g, "")}`;
}

// ── public API ────────────────────────────────────────────────────────────────

export interface IssueOptions {
  baseUrl: string; // origin, already SSRF-validated by the caller
  report: CertReportSummary; // an accepted /api/certifier run summary
  registryId?: string;
  operator?: string;
  jurisdiction?: string;
  ttlDays?: number;
}

export type IssueResult =
  | { ok: true; certificate: Certificate; url: string }
  | { ok: false; error: "below_min_rating" | "signing_unavailable" | "cap_reached"; detail?: string };

/**
 * Build → sign → store a Certificate over an accepted certifier report. Refuses
 * to issue below MIN_RATING (the floor that keeps the registry trustworthy) and
 * when the signing key is absent (we never store an unsigned cert). Idempotency
 * is NOT enforced here (each issue is a fresh dated cert); the by-url index keeps
 * "latest wins" semantics for badge resolution.
 */
export async function issueCertificate(opts: IssueOptions): Promise<IssueResult> {
  if (opts.report.score < MIN_SCORE) {
    return {
      ok: false,
      error: "below_min_rating",
      detail: `score ${opts.report.score} (rating ${opts.report.rating}) is below the minimum ${MIN_SCORE} (rating ${MIN_RATING}).`,
    };
  }
  if ((await listSize()) >= MAX_CERTS) {
    return { ok: false, error: "cap_reached", detail: `certificate cap (${MAX_CERTS}) reached.` };
  }

  const now = new Date();
  const ttlDays = opts.ttlDays && opts.ttlDays > 0 ? opts.ttlDays : DEFAULT_TTL_DAYS;
  const expires = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const certId = newCertId();

  const body: CertificateBody = {
    $schema: `${SITE}/schemas/certificate.v1.json`,
    kind: "ar-agents.certificate",
    version: 1,
    certId,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    subject: {
      baseUrl: opts.baseUrl,
      ...(opts.registryId ? { registryId: opts.registryId } : {}),
      ...(opts.operator ? { operator: opts.operator } : {}),
      ...(opts.jurisdiction ? { jurisdiction: opts.jurisdiction } : {}),
    },
    certifierReport: opts.report,
    attestationRef: buildAttestationRef(opts.registryId),
    status: "valid",
  };

  const signed = await signBody(body);
  if (!signed) return { ok: false, error: "signing_unavailable" };

  const certificate: Certificate = {
    ...body,
    signature: signed.sig,
    sig: signed.sig,
    publicKey: signed.publicKey,
    keyId: CERT_KEY_ID,
    alg: "Ed25519",
  };
  await writeCert(certificate, { isNew: true });
  return { ok: true, certificate, url: `${SITE}/api/certifier/cert/${certId}` };
}

/** Fetch one certificate by id, with expiry recomputed. Null when unknown. */
export async function getCertificate(certId: string): Promise<Certificate | null> {
  const cert = await readCert(certId);
  if (!cert) return null;
  return withRecomputedStatus(cert);
}

/** All certificates (expiry recomputed). Best-effort: [] on backend failure. */
export async function listCertificates(): Promise<Certificate[]> {
  const ids = await listIds();
  const out: Certificate[] = [];
  for (const id of ids) {
    const c = await readCert(id);
    if (c) out.push(withRecomputedStatus(c));
  }
  return out;
}

/** The latest certificate for an origin (badge resolution). Null when none. */
export async function getLatestForUrl(origin: string): Promise<Certificate | null> {
  let id: string | null = null;
  if (isKvWired()) {
    try {
      id = (await kv.get<string>(CERT_BY_URL_KEY(origin))) ?? null;
    } catch {
      id = null;
    }
  }
  if (!id) id = memByUrl.get(origin) ?? null;
  if (!id) return null;
  return getCertificate(id);
}

export type RevokeResult =
  | { ok: true; certificate: Certificate }
  | { ok: false; error: "not_found" | "already_revoked" | "signing_unavailable" };

/**
 * Revoke a certificate — the "teeth". Flips status → "revoked", records who/why,
 * and RE-SIGNS the body so the stored document's signature always matches its
 * current status (a stale "valid" signature can never linger on a revoked cert).
 * Auth (owner-OR-admin) is enforced by the route, not here.
 */
export async function revokeCertificate(
  certId: string,
  reason: string,
  by: "owner" | "admin",
): Promise<RevokeResult> {
  const existing = await readCert(certId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.status === "revoked") return { ok: false, error: "already_revoked" };

  const body: CertificateBody = {
    $schema: existing.$schema,
    kind: existing.kind,
    version: existing.version,
    certId: existing.certId,
    issuedAt: existing.issuedAt,
    expiresAt: existing.expiresAt,
    subject: existing.subject,
    certifierReport: existing.certifierReport,
    attestationRef: existing.attestationRef,
    status: "revoked",
    revocation: { at: new Date().toISOString(), reason: reason.slice(0, 500), by },
  };

  const signed = await signBody(body);
  if (!signed) return { ok: false, error: "signing_unavailable" };

  const revoked: Certificate = {
    ...body,
    signature: signed.sig,
    sig: signed.sig,
    publicKey: signed.publicKey,
    keyId: CERT_KEY_ID,
    alg: "Ed25519",
  };
  await writeCert(revoked);
  return { ok: true, certificate: revoked };
}

/** Test-only: clear the in-memory fallback stores between cases. */
export function __resetMemForTests(): void {
  memCerts.clear();
  memList.clear();
  memByUrl.clear();
}
