/**
 * Ed25519 sign + verify helpers for the operational log (RFC-005 v1).
 *
 * Web Crypto's Ed25519 support is stable across Node 22+ and modern
 * Vercel Edge. The functions below mirror the HMAC ones in audit.ts:
 * canonical-JSON the entry (minus hmac + signature fields), then sign
 * or verify with Ed25519.
 *
 * For the reference implementation the private key is provisioned via
 * env var AUDIT_ED25519_PRIVATE_KEY (PKCS8 DER, base64url). The public
 * key is published at /.well-known/sociedad-ia/keys for offline
 * verification.
 *
 * Not yet wired into appendAudit — RFC-005 § 6 says migration is
 * additive. This file ships the sign + verify primitives; integration
 * into the live audit-log flow is a subsequent step (controlled by an
 * env-var presence check).
 */

import type { AuditEntry } from "./audit";

const enc = new TextEncoder();

/** Canonical-JSON serializer (mirror of audit.ts). */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

/** Base64url decode → Uint8Array. */
function b64urlDecode(s: string): Uint8Array {
  // Convert base64url → base64.
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
  const padded = b64 + "=".repeat(pad);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Uint8Array → base64url. */
function b64urlEncode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Key import (cached per-secret like the HMAC cache in audit.ts)
// ─────────────────────────────────────────────────────────────────────────────

const cachedPriv: { key: CryptoKey | null; pkcs8: string | null } = {
  key: null,
  pkcs8: null,
};

const cachedPub: { keys: Record<string, CryptoKey> } = { keys: {} };

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

async function importPrivateKey(pkcs8B64url: string): Promise<CryptoKey | null> {
  if (cachedPriv.key && cachedPriv.pkcs8 === pkcs8B64url) return cachedPriv.key;
  try {
    const bytes = b64urlDecode(pkcs8B64url);
    const key = await crypto.subtle.importKey(
      "pkcs8",
      bytesToArrayBuffer(bytes),
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      false,
      ["sign"],
    );
    cachedPriv.key = key;
    cachedPriv.pkcs8 = pkcs8B64url;
    return key;
  } catch {
    return null;
  }
}

async function importPublicKey(spkiB64url: string): Promise<CryptoKey | null> {
  if (cachedPub.keys[spkiB64url]) return cachedPub.keys[spkiB64url];
  try {
    const bytes = b64urlDecode(spkiB64url);
    const key = await crypto.subtle.importKey(
      "spki",
      bytesToArrayBuffer(bytes),
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      false,
      ["verify"],
    );
    cachedPub.keys[spkiB64url] = key;
    return key;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface Ed25519Signature {
  keyId: string;
  alg: "ed25519";
  /** base64url-encoded 64-byte signature */
  value: string;
}

/**
 * Sign an entry asymmetrically using the operator's Ed25519 private key.
 * Returns null if no key is configured. Strips both `hmac` and
 * `signature` from the entry before signing — symmetric with verify.
 *
 * @param entry  the entry to sign (will be canonical-JSON'd internally)
 * @param keyId  the keyId the verifier will use to look up the public
 *               key in /.well-known/sociedad-ia/keys
 */
export async function signEntryAsymmetric(
  entry: Omit<AuditEntry, "hmac"> & { signature?: Ed25519Signature },
  keyId: string,
  privateKeyPkcs8B64url?: string,
): Promise<Ed25519Signature | null> {
  const pkcs8 =
    privateKeyPkcs8B64url ?? process.env.AUDIT_ED25519_PRIVATE_KEY?.trim();
  if (!pkcs8) return null;
  const key = await importPrivateKey(pkcs8);
  if (!key) return null;

  // Strip hmac + signature fields before signing.
  const stripped = { ...entry } as Record<string, unknown>;
  delete stripped.hmac;
  delete stripped.signature;

  const sig = await crypto.subtle.sign(
    { name: "Ed25519" } as unknown as AlgorithmIdentifier,
    key,
    enc.encode(canonical(stripped)),
  );
  return {
    keyId,
    alg: "ed25519",
    value: b64urlEncode(new Uint8Array(sig)),
  };
}

/**
 * Verify an entry's asymmetric signature against the supplied public
 * key (SPKI base64url). Returns true iff the signature matches the
 * canonical form of the entry minus hmac + signature.
 */
export async function verifyEntryAsymmetric(
  entry: AuditEntry & { signature?: Ed25519Signature },
  publicKeySpkiB64url: string,
): Promise<boolean> {
  if (!entry.signature) return false;
  if (entry.signature.alg !== "ed25519") return false;
  const pub = await importPublicKey(publicKeySpkiB64url);
  if (!pub) return false;

  const stripped = { ...entry } as Record<string, unknown>;
  delete stripped.hmac;
  delete stripped.signature;

  try {
    const sigBytes = b64urlDecode(entry.signature.value);
    // Re-allocate the underlying buffer as a plain ArrayBuffer so the
    // TS typings don't trip over ArrayBufferLike vs ArrayBuffer.
    const sigArrayBuffer = new ArrayBuffer(sigBytes.byteLength);
    new Uint8Array(sigArrayBuffer).set(sigBytes);
    return await crypto.subtle.verify(
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      pub,
      sigArrayBuffer,
      enc.encode(canonical(stripped)),
    );
  } catch {
    return false;
  }
}

/**
 * Helper: fetch the operator's published key set from
 * /.well-known/sociedad-ia/keys and resolve the key with the given
 * keyId. Returns the SPKI base64url string for use with
 * verifyEntryAsymmetric.
 */
export async function fetchPublicKey(
  baseUrl: string,
  keyId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const r = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/.well-known/sociedad-ia/keys`);
    if (!r.ok) return null;
    const data = (await r.json()) as {
      keys?: Array<{ keyId: string; alg: string; publicKey: string }>;
    };
    const k = data.keys?.find((x) => x.keyId === keyId && x.alg === "ed25519");
    return k?.publicKey ?? null;
  } catch {
    return null;
  }
}
