import { kv } from "@vercel/kv";

/**
 * RFC-006 live implementation: hash-chained ledger + signed anchor chain.
 *
 * Every durable audit entry also lands as a link in a global hash chain (each
 * link commits to the previous one), and the head is sealed into an
 * HMAC-signed anchor chain that is publicly served. This makes history
 * TAMPER-EVIDENT TO WITNESSES: once a third party has fetched and retained an
 * anchor (GET /api/audit/anchor), we cannot truncate or rewrite anything at or
 * below that headSeq without contradicting the anchor they hold.
 *
 * HONEST SCOPE: the anchor chain is signed with OUR OWN AUDIT_HMAC_SECRET, so
 * this is NOT, on its own, proof against the operator. An operator who holds
 * the secret can recompute a fully self-consistent fake history. The real
 * guarantee comes from EXTERNAL witnesses retaining anchors, plus the
 * out-of-band-pinned Ed25519 public key. Committing anchor digests to an
 * external public timestamper (OpenTimestamps / a transparency log) to make it
 * operator-proof WITHOUT relying on witnesses is tracked as the next step; do
 * not claim "operator-adversary-proof" until that ships.
 *
 * CONFORMANCE IS THE SPEC: the shapes and hashes here MUST match the frozen
 * test vectors (public/test-vectors/rfc-006-v1.json) and the independent
 * verifier (public/arg-verify.mjs). test/rfc-006-vectors.test.ts recomputes
 * the vectors with this lib and fails CI on any drift.
 *
 * Link:   { seq, prevHash, societyId, actor, action, meta, ts, hash }
 *         hash = HMAC-SHA256(canonical({seq,prevHash,societyId,actor,action,
 *                meta: meta ?? null, ts}), AUDIT_HMAC_SECRET)
 * Anchor: { seq, headSeq, headHash, prevAnchor, ts, signature }
 *         signature = HMAC-SHA256(canonical({seq,headSeq,headHash,prevAnchor,
 *                ts}), AUDIT_HMAC_SECRET)
 * Genesis prevHash / prevAnchor = "GENESIS".
 */

// ─────────────────────────────────────────────────────────────────────────────
// RFC-006 §2 canonical JSON (domain-checking; mirrors arg-verify.mjs)
// ─────────────────────────────────────────────────────────────────────────────

export function canonical006(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError(`canonical: non-finite number out of domain (RFC-006 §2): ${value}`);
    }
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (t === "bigint" || t === "function" || t === "symbol" || t === "undefined") {
    throw new TypeError(`canonical: ${t} is out of domain (RFC-006 §2): not a JSON value`);
  }
  if (Array.isArray(value)) {
    let out = "[";
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) {
        throw new TypeError(`canonical: array hole at index ${i} out of domain (RFC-006 §2)`);
      }
      out += (i ? "," : "") + canonical006(value[i]);
    }
    return out + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical006(obj[k])}`).join(",")}}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HMAC-SHA256 hex (Web Crypto, Edge-safe)
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const keyCache: { key: CryptoKey | null; secret: string | null } = { key: null, secret: null };

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (keyCache.key && keyCache.secret === secret) return keyCache.key;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  keyCache.key = key;
  keyCache.secret = secret;
  return key;
}

async function hmacHex(secret: string, material: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(material));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface ChainLink {
  seq: number;
  prevHash: string;
  societyId: string | null;
  actor: string;
  action: string;
  meta: unknown;
  ts: string;
  hash: string;
}

export interface Anchor {
  seq: number;
  headSeq: number;
  headHash: string;
  prevAnchor: string;
  ts: string;
  signature: string;
}

/** Link timestamp: native `ts` wins; legacy `createdAt` maps to ISO (verifier parity). */
function linkTs(l: { ts?: string | null; createdAt?: string | number | null }): string | undefined {
  if (l.ts != null) return l.ts;
  if (l.createdAt != null) return new Date(l.createdAt).toISOString();
  return undefined;
}

export async function chainLinkHash(
  secret: string,
  l: Omit<ChainLink, "hash"> & { createdAt?: string | number | null; hash?: string },
): Promise<string> {
  return hmacHex(
    secret,
    canonical006({
      seq: l.seq,
      prevHash: l.prevHash,
      societyId: l.societyId,
      actor: l.actor,
      action: l.action,
      meta: l.meta ?? null,
      ts: linkTs(l),
    }),
  );
}

export async function anchorSig(secret: string, a: Omit<Anchor, "signature">): Promise<string> {
  return hmacHex(
    secret,
    canonical006({
      seq: a.seq,
      headSeq: a.headSeq,
      headHash: a.headHash,
      prevAnchor: a.prevAnchor,
      ts: a.ts,
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification (server-side mirror of arg-verify; offline check stays canonical)
// ─────────────────────────────────────────────────────────────────────────────

export interface ChainVerification {
  valid: boolean;
  count: number;
  brokenAtSeq?: number;
  reason?: string;
  recordsOnly?: true;
}

export async function verifyChain(links: ChainLink[], secret: string): Promise<ChainVerification> {
  let prev = "GENESIS";
  for (let i = 0; i < links.length; i++) {
    const e = links[i];
    if (i > 0 && e.seq !== links[i - 1].seq + 1) {
      return { valid: false, count: links.length, brokenAtSeq: e.seq, reason: "non-contiguous sequence" };
    }
    if (e.prevHash !== prev) {
      return { valid: false, count: links.length, brokenAtSeq: e.seq, reason: "prevHash mismatch (insertion/deletion)" };
    }
    if ((await chainLinkHash(secret, e)) !== e.hash) {
      return { valid: false, count: links.length, brokenAtSeq: e.seq, reason: "hash mismatch (record tampered)" };
    }
    prev = e.hash;
  }
  return { valid: true, count: links.length };
}

export async function verifyRecordsOnly(
  events: ChainLink[],
  secret: string,
): Promise<ChainVerification> {
  for (const e of events) {
    if ((await chainLinkHash(secret, e)) !== e.hash) {
      return {
        valid: false,
        count: events.length,
        brokenAtSeq: e.seq,
        reason: "hash mismatch (record tampered)",
        recordsOnly: true,
      };
    }
  }
  return { valid: true, count: events.length, recordsOnly: true };
}

export async function verifyAnchors(anchors: Anchor[], secret: string): Promise<ChainVerification> {
  let prev = "GENESIS";
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (i > 0 && a.seq !== anchors[i - 1].seq + 1) {
      return { valid: false, count: anchors.length, brokenAtSeq: a.seq, reason: "non-contiguous" };
    }
    if (a.prevAnchor !== prev) {
      return { valid: false, count: anchors.length, brokenAtSeq: a.seq, reason: "prevAnchor mismatch" };
    }
    if ((await anchorSig(secret, a)) !== a.signature) {
      return { valid: false, count: anchors.length, brokenAtSeq: a.seq, reason: "signature mismatch" };
    }
    prev = a.signature;
  }
  return { valid: true, count: anchors.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// KV storage (global ledger, per the vectors' deployment model)
// ─────────────────────────────────────────────────────────────────────────────

const LINKS_KEY = "ledger:links";
const HEAD_KEY = "ledger:head";
const ANCHORS_KEY = "ledger:anchors";
const ANCHOR_HEAD_KEY = "ledger:anchors:head";
const LOCK_KEY = "ledger:lock";

function secretOrNull(): string | null {
  return process.env.AUDIT_HMAC_SECRET?.trim() || null;
}

/**
 * Mutual-exclusion lock with a UNIQUE token + compare-and-delete release, so a
 * holder whose work outran the px expiry cannot delete a lock another writer
 * has since acquired (the classic "expiry + unconditional del" fork bug). The
 * critical section is kept short (no anchoring on this path), so px:15000 is a
 * generous ceiling over a handful of KV round-trips.
 */
async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const token = `${crypto.randomUUID()}`;
  for (let i = 0; i < 5; i++) {
    const got = await kv.set(LOCK_KEY, token, { nx: true, px: 15000 });
    if (got) {
      try {
        return await fn();
      } finally {
        try {
          // Compare-and-delete: only release if we still own the lock.
          if ((await kv.get<string>(LOCK_KEY)) === token) await kv.del(LOCK_KEY);
        } catch {
          // lock expires on its own via px
        }
      }
    }
    await new Promise((r) => setTimeout(r, 200 * (i + 1)));
  }
  return null;
}

/**
 * The authoritative head is the LIST TAIL, never a separate key that can
 * desync from it on a partial write.
 */
async function tailLink(): Promise<ChainLink | null> {
  const t = await kv.lrange<ChainLink>(LINKS_KEY, -1, -1);
  return Array.isArray(t) && t.length && t[0] && typeof t[0].seq === "number" ? t[0] : null;
}

/**
 * Append a link to the global chain. Best-effort by design: the caller
 * (appendAudit) must never fail because chaining failed. Returns the link or
 * null when the secret/KV/lock is unavailable.
 *
 * The list tail is the single source of truth for the head: seq and prevHash
 * are derived from it inside the lock, so a partial write (rpush landed, HEAD
 * cache write did not) self-heals on the next append instead of forking the
 * chain. HEAD_KEY is only a read cache for the GET endpoints.
 */
export async function appendLink(input: {
  societyId: string | null;
  actor: string;
  action: string;
  meta?: unknown;
  ts?: string;
}): Promise<ChainLink | null> {
  const secret = secretOrNull();
  if (!secret) return null;

  return withLock(async () => {
    let tail = await tailLink();

    // First write seeds the genesis link, matching the frozen vectors' model.
    if (!tail) {
      const g: Omit<ChainLink, "hash"> = {
        seq: 1,
        prevHash: "GENESIS",
        societyId: null,
        actor: "system",
        action: "ledger.genesis",
        meta: null,
        ts: new Date().toISOString(),
      };
      const genesis: ChainLink = { ...g, hash: await chainLinkHash(secret, g) };
      await kv.rpush(LINKS_KEY, genesis);
      tail = genesis;
    }

    const base: Omit<ChainLink, "hash"> = {
      seq: tail.seq + 1,
      prevHash: tail.hash,
      societyId: input.societyId,
      actor: input.actor,
      action: input.action,
      meta: input.meta ?? null,
      ts: input.ts ?? new Date().toISOString(),
    };
    const link: ChainLink = { ...base, hash: await chainLinkHash(secret, base) };
    await kv.rpush(LINKS_KEY, link);
    await kv.set(HEAD_KEY, { seq: link.seq, hash: link.hash });
    // Anchoring is intentionally OFF this hot path (it would inflate lock-hold
    // time toward the px expiry and risk a fork). POST /api/audit/anchor and
    // the scheduled sealer create anchors out of band.
    return link;
  });
}

async function createAnchorInternal(secret: string): Promise<Anchor | null> {
  const tail = await tailLink();
  if (!tail) return null;
  const head = { seq: tail.seq, hash: tail.hash };
  const aHead = (await kv.get<{ seq: number; sig: string; ts: string }>(ANCHOR_HEAD_KEY)) ?? {
    seq: 0,
    sig: "GENESIS",
    ts: "",
  };
  // Skip no-op anchors (head unchanged since the last seal).
  const anchors = aHead.seq
    ? await kv.lrange<Anchor>(ANCHORS_KEY, -1, -1)
    : [];
  if (anchors.length && anchors[0].headSeq === head.seq && anchors[0].headHash === head.hash) {
    return anchors[0];
  }
  const base: Omit<Anchor, "signature"> = {
    seq: aHead.seq + 1,
    headSeq: head.seq,
    headHash: head.hash,
    prevAnchor: aHead.sig,
    ts: new Date().toISOString(),
  };
  const anchor: Anchor = { ...base, signature: await anchorSig(secret, base) };
  await kv.rpush(ANCHORS_KEY, anchor);
  await kv.set(ANCHOR_HEAD_KEY, { seq: anchor.seq, sig: anchor.signature, ts: anchor.ts });
  return anchor;
}

/** Force-create an anchor now (public POST endpoint, rate-limited there). */
export async function createAnchor(): Promise<Anchor | null> {
  const secret = secretOrNull();
  if (!secret) return null;
  const res = await withLock(() => createAnchorInternal(secret));
  return res ?? null;
}

export async function readLinks(): Promise<ChainLink[]> {
  const raw = await kv.lrange<ChainLink>(LINKS_KEY, 0, -1);
  return Array.isArray(raw) ? raw : [];
}

export async function readAnchors(): Promise<Anchor[]> {
  const raw = await kv.lrange<Anchor>(ANCHORS_KEY, 0, -1);
  return Array.isArray(raw) ? raw : [];
}

export async function readHead(): Promise<{ seq: number; hash: string } | null> {
  // Source of truth is the list tail; fall back to the HEAD_KEY cache only if
  // the tail read is unavailable.
  const tail = await tailLink();
  if (tail) return { seq: tail.seq, hash: tail.hash };
  return (await kv.get<{ seq: number; hash: string }>(HEAD_KEY)) ?? null;
}

/** Server-side verification of the stored global chain + anchors. */
export async function verifyLedger(): Promise<{
  chain: ChainVerification;
  anchors: ChainVerification;
  head: { seq: number; hash: string } | null;
}> {
  const secret = secretOrNull();
  const links = await readLinks();
  const anchors = await readAnchors();
  if (!secret) {
    return {
      chain: { valid: false, count: links.length, reason: "AUDIT_HMAC_SECRET not configured" },
      anchors: { valid: false, count: anchors.length, reason: "AUDIT_HMAC_SECRET not configured" },
      head: await readHead(),
    };
  }
  return {
    chain: await verifyChain(links, secret),
    anchors: await verifyAnchors(anchors, secret),
    head: await readHead(),
  };
}
