/**
 * OpenTimestamps (OTS) anchor-proof helpers — Edge-safe, additive.
 *
 * This is the trust-MINIMIZED layer requested by RFC-006 §6 ("the anchor chain
 * SHOULD be mirrored to an external notary outside the operator's control") and
 * CAPTURE-TRANSFORMATION tesis #2 ("the moat is NOT the key"). It commits the
 * SAME bytes the anchor sub-chain already HMAC-signs — sha256(canonical006(
 * AnchorBody)) — to the public Bitcoin calendars run by the OpenTimestamps
 * project. The resulting .ots proof is verifiable against the Bitcoin block
 * headers by ANYONE with the official `ots` CLI, with ZERO ar-agents key in the
 * trust path: the operator cannot backdate a digest that is committed to a
 * Bitcoin block they did not mine.
 *
 * ADDITIVE: nothing here changes the HMAC anchor signature or the Ed25519
 * attestation. It is layered on top.
 *
 * EDGE-SAFE: fetch + crypto.subtle only. No node:crypto, no Buffer. All these
 * routes run `export const runtime = "edge"`.
 *
 * Wire protocol (https://github.com/opentimestamps/python-opentimestamps):
 *   - Submit:  POST <calendar>/digest  with the raw 32-byte sha256 digest as
 *              the request body and Accept: application/vnd.opentimestamps.v1.
 *              The response body is a SERIALIZED TIMESTAMP (the operations tree
 *              after the leaf digest) — NOT a full .ots file.
 *   - .ots file = MAGIC header + 1-byte version + serialized
 *              {leaf-op(sha256 of the message) implicitly} ... For a
 *              detached digest the file layout is:
 *                MAGIC | version(0x01) | <crypto op marking the digest's algo
 *                is sha256: 0x08> | <32-byte digest> | <calendar timestamp ops>
 *              We assemble that so the served bytes are a CLI-loadable
 *              detached .ots over our digest.
 *   - Upgrade: GET <calendar>/timestamp/<commitment-hex> returns an upgraded
 *              serialized timestamp once the calendar has confirmed the commit
 *              into a Bitcoin block (an "attestation" op carrying the height).
 */

// ── OTS binary constants (from the OTS spec) ────────────────────────────────

/** ASCII "\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94" */
const OTS_MAGIC = new Uint8Array([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d,
  0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2,
  0xe8, 0x84, 0xe8, 0x92, 0x94,
]);
const OTS_VERSION = 0x01;
/** Crypto-operation tag: the leaf was committed with SHA256 (op tag 0x08). */
const OP_SHA256 = 0x08;
/** Attestation marker prefix (0x00) precedes every attestation in the tree. */
const ATTESTATION_TAG = 0x00;
/** Bitcoin block-header attestation 8-byte tag. */
const BITCOIN_ATTESTATION_TAG = new Uint8Array([
  0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01,
]);
/** Pending (calendar) attestation 8-byte tag. */
const PENDING_ATTESTATION_TAG = new Uint8Array([
  0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e,
]);

const PUBLIC_CALENDARS = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
  "https://alice.btc.calendar.opentimestamps.org",
];

const ENABLED_ENV = "ANCHOR_OTS_ENABLED";

/** True when the operator has opted into OTS stamping (prod default: off). */
export function otsEnabled(): boolean {
  const v = process.env[ENABLED_ENV]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

// ── byte / hex / base64 helpers (Edge-safe, no Buffer) ──────────────────────

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
    throw new TypeError("hexToBytes: not a hex string");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function startsWith(haystack: Uint8Array, needle: Uint8Array, at = 0): boolean {
  if (at + needle.length > haystack.length) return false;
  for (let i = 0; i < needle.length; i++) if (haystack[at + i] !== needle[i]) return false;
  return true;
}

/** SHA-256 over the UTF-8 of a string → lowercase hex (Edge-safe). */
export async function sha256Hex(material: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return bytesToHex(new Uint8Array(buf));
}

// ── .ots file assembly ──────────────────────────────────────────────────────

/**
 * Wrap the calendar's serialized timestamp into a complete, CLI-loadable
 * detached .ots file over `digestHex`. The layout marks the leaf as a SHA256
 * commitment, embeds the 32-byte digest, then appends the calendar operations.
 */
export function assembleOtsFile(digestHex: string, serializedTimestamp: Uint8Array): Uint8Array {
  const digest = hexToBytes(digestHex);
  if (digest.length !== 32) throw new TypeError("assembleOtsFile: digest must be 32 bytes (sha256)");
  return concatBytes([
    OTS_MAGIC,
    new Uint8Array([OTS_VERSION, OP_SHA256]),
    digest,
    serializedTimestamp,
  ]);
}

/** Split an assembled .ots file back into {digestHex, serializedTimestamp}. Null if malformed. */
export function parseOtsFile(
  ots: Uint8Array,
): { digestHex: string; serializedTimestamp: Uint8Array } | null {
  if (!startsWith(ots, OTS_MAGIC)) return null;
  let off = OTS_MAGIC.length;
  if (ots[off] !== OTS_VERSION) return null;
  off += 1;
  if (ots[off] !== OP_SHA256) return null;
  off += 1;
  if (off + 32 > ots.length) return null;
  const digest = ots.slice(off, off + 32);
  off += 32;
  return { digestHex: bytesToHex(digest), serializedTimestamp: ots.slice(off) };
}

// ── attestation extraction (minimal: report, do not trust) ──────────────────

export interface OtsAttestationInfo {
  /** A Bitcoin block-header attestation was found anywhere in the tree. */
  bitcoin: boolean;
  /** The Bitcoin block height carried by the first attestation, if present. */
  bitcoinBlockHeight?: number;
  /** A pending (calendar) attestation was found. */
  pending: boolean;
}

/** Read a varuint (LEB128-style, 7 bits/byte) at `off`; returns [value, nextOff]. */
function readVaruint(buf: Uint8Array, off: number): [number, number] {
  let value = 0;
  let shift = 0;
  let i = off;
  while (i < buf.length) {
    const b = buf[i];
    i += 1;
    value += (b & 0x7f) * 2 ** shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [value, i];
}

/**
 * Scan a serialized timestamp for Bitcoin / pending attestations and the block
 * height. This is a REPORTING scan, not a verification: it does not walk the op
 * tree nor check Bitcoin headers. Full trust comes from `ots verify` (the CLI),
 * which is the canonical check the verifier command points users to.
 */
export function scanAttestations(serialized: Uint8Array): OtsAttestationInfo {
  const info: OtsAttestationInfo = { bitcoin: false, pending: false };
  for (let i = 0; i + 9 <= serialized.length; i++) {
    if (serialized[i] !== ATTESTATION_TAG) continue;
    const tagStart = i + 1;
    if (startsWith(serialized, BITCOIN_ATTESTATION_TAG, tagStart)) {
      info.bitcoin = true;
      // After the 8-byte tag: a varuint length, then a varuint block height.
      let off = tagStart + BITCOIN_ATTESTATION_TAG.length;
      const [, afterLen] = readVaruint(serialized, off);
      off = afterLen;
      const [height] = readVaruint(serialized, off);
      if (Number.isFinite(height) && height > 0) info.bitcoinBlockHeight = height;
    } else if (startsWith(serialized, PENDING_ATTESTATION_TAG, tagStart)) {
      info.pending = true;
    }
  }
  return info;
}

// ── calendar I/O (best-effort; never throws) ────────────────────────────────

async function submitToCalendar(calendar: string, digest: Uint8Array): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${calendar}/digest`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        accept: "application/vnd.opentimestamps.v1",
      },
      body: digest as unknown as BodyInit,
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

async function queryCalendar(calendar: string, commitmentHex: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${calendar}/timestamp/${commitmentHex}`, {
      method: "GET",
      headers: { accept: "application/vnd.opentimestamps.v1" },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

export interface OtsStampResult {
  /** Complete, CLI-loadable detached .ots file over the digest, base64. */
  otsBase64: string;
  /** The calendars that returned a timestamp. */
  calendars: string[];
  attestation: OtsAttestationInfo;
}

/**
 * Submit a 32-byte sha256 digest (hex) to the public OTS calendars and assemble
 * an .ots proof. Best-effort: returns null when no calendar answers (or fetch
 * is unavailable). Never throws.
 */
export async function stampDigest(
  digestHex: string,
  opts?: { calendars?: string[] },
): Promise<OtsStampResult | null> {
  let digest: Uint8Array;
  try {
    digest = hexToBytes(digestHex);
  } catch {
    return null;
  }
  if (digest.length !== 32) return null;
  const calendars = opts?.calendars ?? PUBLIC_CALENDARS;

  const results = await Promise.all(calendars.map((c) => submitToCalendar(c, digest)));
  const ok: { calendar: string; serialized: Uint8Array }[] = [];
  for (let i = 0; i < calendars.length; i++) {
    const s = results[i];
    if (s) ok.push({ calendar: calendars[i], serialized: s });
  }
  if (ok.length === 0) return null;

  // One detached file per digest: use the first calendar's serialized timestamp
  // as the proof body (each calendar independently commits the same digest; the
  // upgrade step later re-queries all of them).
  const first = ok[0];
  const file = assembleOtsFile(digestHex, first.serialized);
  return {
    otsBase64: bytesToB64(file),
    calendars: ok.map((o) => o.calendar),
    attestation: scanAttestations(first.serialized),
  };
}

export interface OtsUpgradeResult {
  otsBase64: string;
  attestation: OtsAttestationInfo;
  /** True only when a Bitcoin block-header attestation is now present. */
  upgraded: boolean;
}

/**
 * Re-query the calendars for a pending proof and, if any now carries a Bitcoin
 * attestation, return the upgraded .ots. Idempotent and best-effort: returns
 * null when nothing changed or no calendar answers. Never throws.
 */
export async function upgradeOts(
  otsBase64: string,
  opts?: { calendars?: string[] },
): Promise<OtsUpgradeResult | null> {
  let parsed: ReturnType<typeof parseOtsFile>;
  try {
    parsed = parseOtsFile(b64ToBytes(otsBase64));
  } catch {
    return null;
  }
  if (!parsed) return null;
  const { digestHex } = parsed;
  const calendars = opts?.calendars ?? PUBLIC_CALENDARS;

  const results = await Promise.all(calendars.map((c) => queryCalendar(c, digestHex)));
  for (let i = 0; i < calendars.length; i++) {
    const s = results[i];
    if (!s) continue;
    const att = scanAttestations(s);
    if (att.bitcoin) {
      const file = assembleOtsFile(digestHex, s);
      return { otsBase64: bytesToB64(file), attestation: att, upgraded: true };
    }
  }
  return null;
}
