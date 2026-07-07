/**
 * Oracle webhooks: the PUSH half of the demand-side rail. A consumer registers a
 * URL (SSRF-guarded) to be notified when an entity's good-standing / lifecycle
 * state changes, so it doesn't have to poll. The delivered payload is Ed25519
 * -signed with the same format the good-standing oracle uses, so the receiver
 * verifies it offline with the SAME `arg-verify attestation` verb.
 *
 * fireWebhooks is BEST-EFFORT + fire-and-forget: it never blocks or throws into the
 * lifecycle transition that triggered it. KV-backed with in-memory fallback.
 */

import { kv } from "@vercel/kv";
import { safeExternalUrl, safeFetch } from "./ssrf";
import { getConsumer } from "./oracle-consumer";

export interface Webhook {
  id: string;
  consumerId: string;
  url: string;
  /** Only deliver events for this entity; omitted = all entities. */
  entityId?: string;
  createdAt: string;
}

const KEY_HOOK = (id: string) => `registry:webhook:${id}`;
const KEY_INDEX = "registry:webhook:ids";
const MAX_HOOKS = 1000;

const memHooks = new Map<string, Webhook>();
const memIndex = new Set<string>();

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

async function allHooks(): Promise<Webhook[]> {
  let ids: string[];
  if (!isKvWired()) {
    ids = Array.from(memIndex);
  } else {
    try {
      const raw = await kv.smembers<string[]>(KEY_INDEX);
      ids = Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }
  const out: Webhook[] = [];
  for (const id of ids) {
    const h = isKvWired() ? await kv.get<Webhook>(KEY_HOOK(id)).catch(() => null) : memHooks.get(id) ?? null;
    if (h) out.push(h);
  }
  return out;
}

/** Register a webhook. SSRF-guards the URL (must be public http(s)). */
export async function registerWebhook(
  consumerId: string,
  url: string,
  entityId?: string,
  opts?: { now?: string },
): Promise<Webhook | { error: string } | null> {
  const safe = safeExternalUrl(url);
  if (!safe) return { error: "invalid url (must be a public http(s) endpoint)" };
  const hook: Webhook = {
    id: crypto.randomUUID(),
    consumerId,
    url: safe.href,
    ...(entityId ? { entityId } : {}),
    createdAt: opts?.now ?? new Date().toISOString(),
  };
  if (!isKvWired()) {
    if (memIndex.size >= MAX_HOOKS) return null;
    memHooks.set(hook.id, hook);
    memIndex.add(hook.id);
    return hook;
  }
  try {
    const count = await kv.scard(KEY_INDEX);
    if (typeof count === "number" && count >= MAX_HOOKS) return null;
    await kv.set(KEY_HOOK(hook.id), hook);
    await kv.sadd(KEY_INDEX, hook.id);
    return hook;
  } catch {
    return null;
  }
}

export async function listWebhooks(consumerId: string): Promise<Webhook[]> {
  return (await allHooks()).filter((h) => h.consumerId === consumerId);
}

export async function deleteWebhook(consumerId: string, id: string): Promise<boolean> {
  const h = isKvWired() ? await kv.get<Webhook>(KEY_HOOK(id)).catch(() => null) : memHooks.get(id) ?? null;
  if (!h || h.consumerId !== consumerId) return false; // owner-scoped
  if (!isKvWired()) {
    memHooks.delete(id);
    memIndex.delete(id);
    return true;
  }
  try {
    await kv.del(KEY_HOOK(id));
    await kv.srem(KEY_INDEX, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tear down every webhook owned by a consumer. Call this when a consumer is
 * REVOKED so its push subscriptions are removed, not merely muted at delivery
 * (delivery already skips revoked consumers — this is the hygiene half so a
 * revoked consumer's hooks stop counting toward MAX_HOOKS and disappear). Returns
 * the number deleted. Best-effort.
 */
export async function deleteWebhooksForConsumer(consumerId: string): Promise<number> {
  const owned = (await allHooks()).filter((h) => h.consumerId === consumerId);
  let deleted = 0;
  for (const h of owned) {
    if (await deleteWebhook(consumerId, h.id)) deleted++;
  }
  return deleted;
}

// ── delivery (Ed25519-signed, best-effort) ──────────────────────────────────────

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

async function signEvent(body: unknown): Promise<{ sig: string; publicKey: string } | null> {
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
    const sig = await crypto.subtle.sign(
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      key,
      enc.encode(canonical(body)),
    );
    return { sig: bytesToB64(new Uint8Array(sig)), publicKey: bytesToB64(b64urlToBytes(spki)) };
  } catch {
    return null;
  }
}

export interface OracleEvent {
  entityId: string;
  /** "status" | "good-standing" | "incident" */
  kind: string;
  to: string;
  reason?: string;
  at?: string;
}

/**
 * Fire matching webhooks for an event. BEST-EFFORT + fire-and-forget: awaits its
 * own delivery attempts but is designed to be called with `void` so it NEVER
 * blocks or throws into the lifecycle transition. Re-guards each URL with SSRF at
 * delivery time (a stored URL could resolve differently).
 */
export async function fireWebhooks(event: OracleEvent): Promise<void> {
  try {
    const matched = (await allHooks()).filter((h) => !h.entityId || h.entityId === event.entityId);
    if (matched.length === 0) return;
    // Revocation must cut the PUSH channel too: a de-authorized (or compromised)
    // consumer keeps receiving the signed feed otherwise. Drop hooks whose owning
    // consumer is explicitly revoked. A consumer that doesn't resolve (null) is
    // left as-is (deliver) for backward-compat — revokeConsumer sets revoked:true
    // on the EXISTING record, so a genuinely-revoked consumer is always dropped.
    const consumerIds = [...new Set(matched.map((h) => h.consumerId))];
    const revoked = new Set<string>();
    await Promise.all(
      consumerIds.map(async (cid) => {
        const c = await getConsumer(cid);
        if (c && c.revoked) revoked.add(cid);
      }),
    );
    const hooks = matched.filter((h) => !revoked.has(h.consumerId));
    if (hooks.length === 0) return;
    const body = {
      kind: "ar-agents.oracle.event",
      version: 1,
      entityId: event.entityId,
      event: { kind: event.kind, to: event.to, ...(event.reason ? { reason: event.reason } : {}) },
      at: event.at ?? new Date().toISOString(),
    };
    const signed = await signEvent(body);
    const payload = JSON.stringify(signed ? { body, ...signed, alg: "Ed25519" } : { body });
    await Promise.all(
      hooks.map(async (h) => {
        const safe = safeExternalUrl(h.url);
        if (!safe) return;
        try {
          // safeFetch re-validates every redirect hop, so a subscriber cannot
          // 3xx-redirect the delivery to a loopback / metadata / RFC1918 host.
          await safeFetch(safe.href, {
            timeoutMs: 5000,
            init: {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: payload,
            },
          });
        } catch {
          // best-effort: a dead or refusing subscriber never affects the registry
        }
      }),
    );
  } catch {
    // never throw into the caller (a lifecycle transition)
  }
}

export function __resetWebhooksForTests(): void {
  memHooks.clear();
  memIndex.clear();
}
