/**
 * Key-binding verification: prove a key controls a signed identity document,
 * WITHOUT the verifier ever holding that key.
 *
 * This is the trust-minimized identity primitive behind the "verify your
 * agent" flow. An agent publishes an RFC-002 identity doc (an `agents.json`
 * with an `identity` + a `binding`) and signs a canonical statement over the
 * doc's hash with its own key. Anyone can then check, from signatures alone,
 * that the claimed key/address controls the doc. ar-agents being offline or
 * dishonest cannot forge a binding.
 *
 * It generalizes the single-partner `$SAIRI × ar-agents` spec
 * (docs/proposals/sairi-integration-spec.md) into a reusable method that
 * supports BOTH schemes any agent might already have:
 *
 *   - `ed25519`         — our own RFC-004/005 scheme (raw 32-byte public key).
 *   - `evm-secp256k1`   — a Base/Ethereum key. EOA via EIP-191 `personal_sign`
 *                         + ecrecover; smart-contract account (EIP-1271) via an
 *                         INJECTED `isValidSignature` RPC call.
 *
 * # Design invariants
 *
 * 1. **Never trust `binding.statement` / `binding.docHash` from the doc.** The
 *    verifier RE-derives both from the doc body and the identity fields, then
 *    checks the signature over the re-derived statement. So mutating any doc
 *    field (including swapping `identity.address` to an attacker's) breaks the
 *    binding — the recomputed hash changes and/or the recovered signer no
 *    longer matches the claimed identity.
 * 2. **Reproducible.** `issuedAt` is taken from the doc, never wall-clock, so a
 *    verifier re-checking next year hashes the same bytes.
 * 3. **Edge-safe + tiny.** Web Crypto for SHA-256; `@noble/curves` +
 *    `@noble/hashes` (audited, zero-dep) for secp256k1 recover / ed25519 /
 *    keccak. No `viem`/`ethers` (bundle size), no `node:crypto` (Edge).
 * 4. **Pure.** No network. EIP-1271 needs an on-chain call, so the caller
 *    injects `rpcCall`; the package itself never opens a socket.
 *
 * Exposed as a subpath (`@ar-agents/identity-attest/key-binding`) so importing
 * it does not pull secp256k1/keccak into the main Edge bundle.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { ed25519 } from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";

// ─────────────────────────────────────────────────────────────────────────────
// Public method identifiers (compatible with the free-form VerificationMethod
// string union in ./types — kept here so this module stays self-contained).
// ─────────────────────────────────────────────────────────────────────────────

/** Verification method emitted for a proven EVM secp256k1 identity. */
export const METHOD_EVM_SECP256K1 = "evm_secp256k1" as const;
/** Verification method emitted for a proven Ed25519 key-binding. */
export const METHOD_ED25519_KEY_BINDING = "ed25519_key_binding" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type KeyBindingScheme = "evm-secp256k1" | "ed25519";

/**
 * The `identity` object inside an RFC-002 identity doc. Only the fields this
 * verifier reads are typed; adopters may carry more.
 */
export interface IdentityClaim {
  scheme: KeyBindingScheme;
  // evm-secp256k1
  /** 0x-prefixed 20-byte address. Compared case-insensitively. */
  address?: string;
  /** EVM chain id (e.g. 8453 for Base). Part of the signed statement. */
  chainId?: number;
  /** `eoa` → ecrecover; `erc1271` → on-chain isValidSignature call. */
  accountType?: "eoa" | "erc1271";
  // ed25519
  /** Raw 32-byte Ed25519 public key, hex or base64url or SPKI-DER. */
  publicKey?: string;
  /** Optional key id for rotation tracking. */
  keyId?: string;
}

/** The `binding` object an adopter attaches to their doc (advisory here). */
export interface IdentityBinding {
  scheme: "eip-191" | "ed25519";
  /** The statement the adopter says they signed. NOT trusted; re-derived. */
  statement?: string;
  /** The signature. EVM: 0x + 65 bytes. Ed25519: 64-byte hex or base64url. */
  signature: string;
  /** The doc hash the adopter says they signed over. NOT trusted; recomputed. */
  docHash?: string;
}

/** The identity doc as published (a superset of the fields we read). */
export interface IdentityDoc {
  identity: IdentityClaim;
  binding: IdentityBinding | null;
  /** ISO-8601, part of the signed statement. Taken as-is (reproducible). */
  issuedAt: string;
  [k: string]: unknown;
}

/**
 * An abstract eth_call, injected by the caller for the EIP-1271 path. Returns
 * the raw hex result of `eth_call({ to, data })`. The package supplies the
 * calldata; the caller supplies the transport (a Base RPC, a viem client, a
 * mock in tests). Keeps the package pure + Edge-safe + offline-testable.
 */
export type Eip1271RpcCall = (params: {
  to: string;
  data: string;
}) => Promise<string>;

export interface KeyBindingResult {
  /** Overall verdict: did the claimed key demonstrably sign this doc? */
  verified: boolean;
  scheme: KeyBindingScheme | "unknown";
  /** The identity that was cryptographically proven (null when unverified). */
  subject:
    | { kind: "evm-address"; value: string }
    | { kind: "ed25519-pubkey"; value: string }
    | null;
  /** Per-check breakdown, for transparent UIs + debugging. */
  checks: {
    /** Recomputed doc hash equals `binding.docHash` (adopter's claim). */
    docHashMatches: boolean;
    /** Signature verifies over the RE-DERIVED statement. */
    signatureValid: boolean;
    /** (EVM EOA) recovered signer equals `identity.address`. */
    addressMatches?: boolean;
    /** (EIP-1271) the contract's isValidSignature returned the magic value. */
    contractApproved?: boolean;
  };
  /** The hash the verifier recomputed over the doc body (binding nulled). */
  recomputedDocHash: string;
  /** (EVM EOA) the address recovered from the signature, for display. */
  recoveredAddress?: string;
  /** Human-readable failure reason. `null` when `verified` is true. */
  reason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonicalization + hashing (byte-compatible with the adopter drop-in snippet
// in the SAIRI spec § 4 — sorted keys, no whitespace, JSON-stringified leaves).
// ─────────────────────────────────────────────────────────────────────────────

const CANONICAL_MAX_DEPTH = 64;

/**
 * Deterministic JSON: object keys sorted, no whitespace. Both the adopter (who
 * signs) and the verifier (who checks) must hash identical bytes, so this MUST
 * stay byte-identical to the snippet adopters copy. Depth-guarded to refuse
 * pathologically nested docs (a real JSON identity doc is shallow).
 */
export function canonicalize(value: unknown, depth = 0): string {
  if (depth > CANONICAL_MAX_DEPTH) {
    throw new Error("canonicalize: max nesting depth exceeded");
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v, depth + 1)).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.keys(value as object)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonicalize((value as Record<string, unknown>)[k], depth + 1),
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

const textEncoder = new TextEncoder();

function requireSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error(
      "@ar-agents/identity-attest/key-binding: Web Crypto API unavailable. Use Node 18+, Vercel Edge, Workers, or a browser.",
    );
  }
  return c.subtle;
}

/** SHA-256 → lowercase hex. */
export async function sha256Hex(message: string): Promise<string> {
  const buf = await requireSubtle().digest(
    "SHA-256",
    textEncoder.encode(message),
  );
  return bytesToHex(new Uint8Array(buf));
}

/**
 * The canonical hash an adopter signs over: the doc with `binding` forced to
 * `null`, canonicalized, SHA-256'd. Nulling `binding` (rather than deleting it)
 * matches the adopter snippet exactly.
 */
export async function identityDocHash(doc: IdentityDoc): Promise<string> {
  return sha256Hex(canonicalize({ ...doc, binding: null }));
}

/**
 * Re-derive the exact statement bytes the adopter signed, from the identity
 * fields + the recomputed doc hash + issuedAt. Never reads `binding.statement`.
 *
 * The EVM form is byte-identical to the SAIRI spec § 3b so a doc produced by
 * that drop-in snippet verifies here unchanged.
 */
export function canonicalIdentityStatement(
  identity: IdentityClaim,
  docHash: string,
  issuedAt: string,
): string {
  if (identity.scheme === "evm-secp256k1") {
    return (
      "ar-agents RFC-002 identity binding v1\n" +
      `address: ${identity.address}\n` +
      `chainId: ${identity.chainId}\n` +
      `agents.json sha256: ${docHash}\n` +
      `issuedAt: ${issuedAt}`
    );
  }
  // ed25519
  return (
    "ar-agents RFC-002 identity binding v1\n" +
    `publicKey: ${identity.publicKey}\n` +
    "alg: ed25519\n" +
    `agents.json sha256: ${docHash}\n` +
    `issuedAt: ${issuedAt}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Byte helpers
// ─────────────────────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array | null {
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (h.length === 0 || h.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(h)) {
    return null;
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function b64urlToBytes(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
    const padded = b64 + "=".repeat(pad);
    if (typeof atob === "function") {
      const bin = atob(padded);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    // Node without atob in scope.
    return new Uint8Array(Buffer.from(padded, "base64"));
  } catch {
    return null;
  }
}

/**
 * Parse an Ed25519 public key given as raw hex (64 chars), base64url of the
 * raw 32 bytes, or an SPKI-DER (the 12-byte Ed25519 prefix + the 32-byte key,
 * as published at /.well-known/sociedad-ia/keys). Returns the raw 32 bytes.
 */
function parseEd25519PublicKey(s: string): Uint8Array | null {
  const asHex = hexToBytes(s);
  if (asHex && asHex.length === 32) return asHex;
  const asB64 = b64urlToBytes(s);
  if (asB64) {
    if (asB64.length === 32) return asB64;
    // Ed25519 SPKI is a fixed 12-byte header followed by the 32-byte key.
    if (asB64.length === 44) return asB64.slice(12);
  }
  return null;
}

/** Parse a 64-byte Ed25519 signature given as hex or base64url. */
function parseEd25519Signature(s: string): Uint8Array | null {
  const asHex = hexToBytes(s);
  if (asHex && asHex.length === 64) return asHex;
  const asB64 = b64urlToBytes(s);
  if (asB64 && asB64.length === 64) return asB64;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVM secp256k1 (EIP-191 personal_sign)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The EIP-191 `personal_sign` digest: keccak256 over
 * `"\x19Ethereum Signed Message:\n" + byteLength + message`. This is the
 * bytes32 a wallet actually signs, and the `hash` an EIP-1271 contract's
 * `isValidSignature` receives.
 */
export function eip191MessageHash(message: string): Uint8Array {
  const msg = textEncoder.encode(message);
  const prefix = textEncoder.encode(
    `\x19Ethereum Signed Message:\n${msg.length}`,
  );
  const full = new Uint8Array(prefix.length + msg.length);
  full.set(prefix, 0);
  full.set(msg, prefix.length);
  return keccak_256(full);
}

/** Derive the 0x-prefixed lowercase address from a 65-byte uncompressed pubkey. */
function addressFromUncompressedPubkey(pub65: Uint8Array): string {
  // Drop the 0x04 prefix; keccak the 64-byte X||Y; take the last 20 bytes.
  const hash = keccak_256(pub65.slice(1));
  return "0x" + bytesToHex(hash.slice(-20));
}

/**
 * Recover the 0x-prefixed lowercase signer address from an EIP-191 signature
 * over `statement`. Returns null on any malformed input. Never throws.
 */
export function recoverEvmAddress(
  statement: string,
  signatureHex: string,
): string | null {
  const sig = hexToBytes(signatureHex);
  if (!sig || sig.length !== 65) return null;
  const rs = sig.slice(0, 64);
  let v = sig[64]!;
  // Accept v as {27,28} (yellow paper) or {0,1} (raw recovery bit).
  if (v === 27 || v === 28) v -= 27;
  if (v !== 0 && v !== 1) return null;
  try {
    const hash = eip191MessageHash(statement);
    const point = secp256k1.Signature.fromCompact(bytesToHex(rs))
      .addRecoveryBit(v)
      .recoverPublicKey(bytesToHex(hash));
    return addressFromUncompressedPubkey(point.toRawBytes(false));
  } catch {
    return null;
  }
}

// ABI selector for isValidSignature(bytes32,bytes) and its magic return value.
const ERC1271_SELECTOR = "1626ba7e";
const ERC1271_MAGIC = "1626ba7e";

/**
 * ABI-encode the calldata for `isValidSignature(bytes32 hash, bytes signature)`.
 * Layout: selector ‖ hash(32) ‖ offset=0x40(32) ‖ len(32) ‖ signature (right-
 * padded to a 32-byte boundary). Returned as a 0x-prefixed hex string.
 */
export function encodeIsValidSignatureCall(
  hash: Uint8Array,
  signature: Uint8Array,
): string {
  const word = (n: number) => n.toString(16).padStart(64, "0");
  const hashHex = bytesToHex(hash).padStart(64, "0");
  const offset = word(0x40);
  const len = word(signature.length);
  const paddedLen = Math.ceil(signature.length / 32) * 32;
  const sigPadded = new Uint8Array(paddedLen);
  sigPadded.set(signature, 0);
  return (
    "0x" + ERC1271_SELECTOR + hashHex + offset + len + bytesToHex(sigPadded)
  );
}

/**
 * Verify an EIP-1271 smart-contract-account signature by calling the account's
 * `isValidSignature(hash, sig)` through the injected `rpcCall`. Returns true iff
 * the contract returns the `0x1626ba7e` magic value. Never throws (RPC failure
 * → false).
 */
export async function verifyErc1271(
  address: string,
  statement: string,
  signatureHex: string,
  rpcCall: Eip1271RpcCall,
): Promise<boolean> {
  const sig = hexToBytes(signatureHex);
  if (!sig) return false;
  try {
    const hash = eip191MessageHash(statement);
    const data = encodeIsValidSignatureCall(hash, sig);
    const result = await rpcCall({ to: address, data });
    const clean = (result || "").toLowerCase().replace(/^0x/, "");
    return clean.slice(0, 8) === ERC1271_MAGIC;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ed25519
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify an Ed25519 signature over `statement` against a raw/SPKI public key.
 * Never throws.
 */
export function verifyEd25519Statement(
  statement: string,
  signature: string,
  publicKey: string,
): boolean {
  const pub = parseEd25519PublicKey(publicKey);
  const sig = parseEd25519Signature(signature);
  if (!pub || !sig) return false;
  try {
    return ed25519.verify(sig, textEncoder.encode(statement), pub);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level verifier
// ─────────────────────────────────────────────────────────────────────────────

function fail(
  scheme: KeyBindingResult["scheme"],
  recomputedDocHash: string,
  reason: string,
  checks?: Partial<KeyBindingResult["checks"]>,
): KeyBindingResult {
  return {
    verified: false,
    scheme,
    subject: null,
    checks: {
      docHashMatches: false,
      signatureValid: false,
      ...checks,
    },
    recomputedDocHash,
    reason,
  };
}

/**
 * Verify that the key/address claimed in `doc.identity` demonstrably controls
 * `doc` — the trust-minimized "is this agent who it says it is" check.
 *
 * Steps (all deterministic, no wall-clock):
 *   1. Recompute the doc hash over the body with `binding` nulled.
 *   2. Re-derive the canonical statement from the identity fields + that hash +
 *      `doc.issuedAt` (never trusting `binding.statement`).
 *   3. Verify the signature over the re-derived statement:
 *        - ed25519       → ed25519.verify against the raw public key.
 *        - evm eoa       → ecrecover, then recovered address === identity.address.
 *        - evm erc1271   → on-chain isValidSignature via injected rpcCall.
 *
 * @param doc   the published identity doc.
 * @param opts.rpcCall  required only for `accountType: "erc1271"`.
 */
export async function verifyKeyBinding(
  doc: IdentityDoc,
  opts: { rpcCall?: Eip1271RpcCall } = {},
): Promise<KeyBindingResult> {
  // Recompute up front so every failure path carries the hash.
  let recomputedDocHash: string;
  try {
    recomputedDocHash = await identityDocHash(doc);
  } catch (e) {
    return fail(
      "unknown",
      "",
      `could not canonicalize/hash the doc: ${(e as Error).message}`,
    );
  }

  const identity = doc?.identity;
  const binding = doc?.binding;
  if (!identity || typeof identity !== "object") {
    return fail("unknown", recomputedDocHash, "doc.identity is missing");
  }
  if (!binding || typeof binding !== "object" || !binding.signature) {
    return fail(
      (identity.scheme as KeyBindingScheme) ?? "unknown",
      recomputedDocHash,
      "doc.binding.signature is missing",
    );
  }
  if (typeof doc.issuedAt !== "string" || doc.issuedAt.length === 0) {
    return fail(
      identity.scheme ?? "unknown",
      recomputedDocHash,
      "doc.issuedAt is missing (required for a reproducible statement)",
    );
  }

  const docHashMatches =
    typeof binding.docHash === "string" &&
    binding.docHash.toLowerCase() === recomputedDocHash.toLowerCase();

  const statement = canonicalIdentityStatement(
    identity,
    recomputedDocHash,
    doc.issuedAt,
  );

  if (identity.scheme === "ed25519") {
    if (!identity.publicKey) {
      return fail("ed25519", recomputedDocHash, "identity.publicKey is missing", {
        docHashMatches,
      });
    }
    const signatureValid = verifyEd25519Statement(
      statement,
      binding.signature,
      identity.publicKey,
    );
    if (!signatureValid) {
      return fail(
        "ed25519",
        recomputedDocHash,
        "ed25519 signature does not verify over the reconstructed statement (doc may be tampered, or the wrong key)",
        { docHashMatches },
      );
    }
    return {
      verified: true,
      scheme: "ed25519",
      subject: { kind: "ed25519-pubkey", value: identity.publicKey.toLowerCase() },
      checks: { docHashMatches, signatureValid: true },
      recomputedDocHash,
      reason: null,
    };
  }

  if (identity.scheme === "evm-secp256k1") {
    if (!identity.address || !/^0x[0-9a-fA-F]{40}$/.test(identity.address)) {
      return fail(
        "evm-secp256k1",
        recomputedDocHash,
        "identity.address is missing or not a 20-byte 0x address",
        { docHashMatches },
      );
    }

    if (identity.accountType === "erc1271") {
      if (!opts.rpcCall) {
        return fail(
          "evm-secp256k1",
          recomputedDocHash,
          "accountType 'erc1271' requires an rpcCall to check isValidSignature on-chain; none was provided",
          { docHashMatches },
        );
      }
      const contractApproved = await verifyErc1271(
        identity.address,
        statement,
        binding.signature,
        opts.rpcCall,
      );
      if (!contractApproved) {
        return fail(
          "evm-secp256k1",
          recomputedDocHash,
          "the contract account's isValidSignature did not return the magic value (invalid signature, or doc tampered)",
          { docHashMatches, contractApproved: false },
        );
      }
      return {
        verified: true,
        scheme: "evm-secp256k1",
        subject: { kind: "evm-address", value: identity.address.toLowerCase() },
        checks: {
          docHashMatches,
          signatureValid: true,
          addressMatches: true,
          contractApproved: true,
        },
        recomputedDocHash,
        reason: null,
      };
    }

    // Default: EOA via ecrecover.
    const recovered = recoverEvmAddress(statement, binding.signature);
    if (!recovered) {
      return fail(
        "evm-secp256k1",
        recomputedDocHash,
        "could not recover a signer from the signature (malformed signature)",
        { docHashMatches, addressMatches: false },
      );
    }
    const addressMatches =
      recovered.toLowerCase() === identity.address.toLowerCase();
    if (!addressMatches) {
      return {
        ...fail(
          "evm-secp256k1",
          recomputedDocHash,
          "recovered signer does not match identity.address (doc tampered, or signature from a different key)",
          { docHashMatches, signatureValid: true, addressMatches: false },
        ),
        recoveredAddress: recovered,
      };
    }
    return {
      verified: true,
      scheme: "evm-secp256k1",
      subject: { kind: "evm-address", value: identity.address.toLowerCase() },
      checks: { docHashMatches, signatureValid: true, addressMatches: true },
      recomputedDocHash,
      recoveredAddress: recovered,
      reason: null,
    };
  }

  return fail(
    "unknown",
    recomputedDocHash,
    `unsupported identity.scheme: ${String(identity.scheme)}`,
    { docHashMatches },
  );
}
