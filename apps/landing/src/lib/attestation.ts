import { canonical006, readHead, readLinks, verifyRecordsOnly, type ChainLink } from "./ledger";

/**
 * RFC-006 §8 attestation + export bundle generation.
 *
 * The attestation is an Ed25519 signature over canonical(body), where body
 * binds: the society, its event count, the per-record verification result,
 * and the global chain head. It is verifiable OFFLINE by anyone with
 * arg-verify.mjs (`arg-verify attestation` / `arg-verify bundle`), no trust
 * in this server and no secret required: Ed25519 is public-key.
 *
 * Field shapes mirror the frozen vectors (rfc-006-v1.json) exactly: that
 * file plus arg-verify.mjs are the spec; drift fails CI.
 */

// ── base64 helpers (Edge-safe, no Buffer) ───────────────────────────────────

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

// ── Ed25519 signing (key from env, cached) ──────────────────────────────────

const enc = new TextEncoder();
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

/** SPKI public key as STANDARD base64 (arg-verify reads it with base64). */
function publicKeyB64(): string | null {
  const spki = process.env.AUDIT_ED25519_PUBLIC_KEY?.trim();
  if (!spki) return null;
  return bytesToB64(b64urlToBytes(spki));
}

// ── Attestation ─────────────────────────────────────────────────────────────

export interface AttestationBody {
  kind: "vultur.compliance.attestation";
  version: 1;
  issuedAt: string;
  society: { id: string; slug: string };
  chain: {
    globalHeadSeq: number;
    globalHeadHash: string;
    societyEventCount: number;
    verification: { valid: boolean; count: number };
  };
  mode: "production";
}

export interface Attestation {
  body: AttestationBody;
  /** Ed25519 over canonical(body), standard base64. `signature` mirrors it. */
  sig: string;
  signature: string;
  publicKey: string;
  alg: "Ed25519";
}

export interface AttestationResult {
  attestation: Attestation;
  events: ChainLink[];
}

/**
 * Build + sign the attestation for one society (sessionId). Returns null when
 * the Ed25519 key is missing or the ledger is empty for everyone.
 */
export async function buildAttestation(slug: string): Promise<AttestationResult | null> {
  const secret = process.env.AUDIT_HMAC_SECRET?.trim();
  const key = await privateKey();
  const pub = publicKeyB64();
  if (!secret || !key || !pub) return null;

  const [links, head] = await Promise.all([readLinks(), readHead()]);
  if (!head) return null;
  const events = links.filter((l) => l.societyId === slug);
  const verification = await verifyRecordsOnly(events, secret);

  const body: AttestationBody = {
    kind: "vultur.compliance.attestation",
    version: 1,
    issuedAt: new Date().toISOString(),
    society: { id: slug, slug },
    chain: {
      globalHeadSeq: head.seq,
      globalHeadHash: head.hash,
      societyEventCount: events.length,
      // arg-verify binds canonical(body.chain.verification) to the bundle's
      // ledgerVerification; keep the clean {valid, count} shape of the vectors.
      verification: { valid: verification.valid, count: verification.count },
    },
    mode: "production",
  };

  const sigBytes = await crypto.subtle.sign(
    { name: "Ed25519" } as unknown as AlgorithmIdentifier,
    key,
    enc.encode(canonical006(body)),
  );
  const sig = bytesToB64(new Uint8Array(sigBytes));
  return {
    attestation: { body, sig, signature: sig, publicKey: pub, alg: "Ed25519" },
    events,
  };
}
