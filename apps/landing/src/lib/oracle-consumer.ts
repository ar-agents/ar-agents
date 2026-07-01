/**
 * Oracle consumer keys: admin-minted API keys for the parties that query the
 * good-standing oracle programmatically (banks, PSPs, marketplaces, agent
 * frameworks). This is the demand-side rail: a counterparty authenticates with
 * its own key to pull the granular profile + subscribe to webhooks.
 *
 * The raw key is shown ONCE at mint time; we persist only its SHA-256 hash + the
 * consumer metadata, so a store compromise never yields usable keys. Keys are
 * revocable. KV-backed with in-memory fallback; edge-safe (Web Crypto only).
 */

import { kv } from "@vercel/kv";
import { constantTimeEqual } from "./incorporate-auth";

export interface OracleConsumer {
  id: string;
  label: string;
  createdAt: string;
  revoked?: boolean;
}

const KEY_BY_HASH = (hash: string) => `registry:consumer:byhash:${hash}`;
const KEY_CONSUMER = (id: string) => `registry:consumer:${id}`;
const KEY_INDEX = "registry:consumer:ids";

const memByHash = new Map<string, string>();
const memConsumers = new Map<string, OracleConsumer>();
const memIndex = new Set<string>();

const MAX_CONSUMERS = 2000;

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

const enc = new TextEncoder();

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i]!.toString(16).padStart(2, "0");
  return hex;
}

/** A URL-safe random key: `orc_<43 base64url chars>` (32 random bytes). */
function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64url = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `orc_${b64url}`;
}

/**
 * Mint a consumer key. Returns the raw key ONCE (never retrievable again) plus the
 * consumer record. Returns null at capacity or on a KV write failure.
 */
export async function mintConsumerKey(
  label: string,
  opts?: { now?: string },
): Promise<{ consumer: OracleConsumer; key: string } | null> {
  const key = generateKey();
  const hash = await sha256Hex(key);
  const consumer: OracleConsumer = {
    id: crypto.randomUUID(),
    label: label.slice(0, 120) || "consumer",
    createdAt: opts?.now ?? new Date().toISOString(),
  };
  if (!isKvWired()) {
    if (memIndex.size >= MAX_CONSUMERS) return null;
    memByHash.set(hash, consumer.id);
    memConsumers.set(consumer.id, consumer);
    memIndex.add(consumer.id);
    return { consumer, key };
  }
  try {
    const count = await kv.scard(KEY_INDEX);
    if (typeof count === "number" && count >= MAX_CONSUMERS) return null;
    await kv.set(KEY_BY_HASH(hash), consumer.id);
    await kv.set(KEY_CONSUMER(consumer.id), consumer);
    await kv.sadd(KEY_INDEX, consumer.id);
    return { consumer, key };
  } catch {
    return null;
  }
}

/** Resolve a raw key to its (non-revoked) consumer, or null. */
export async function verifyConsumerKey(key: string): Promise<OracleConsumer | null> {
  if (!key || !key.startsWith("orc_")) return null;
  const hash = await sha256Hex(key);
  let id: string | null;
  if (!isKvWired()) {
    id = memByHash.get(hash) ?? null;
  } else {
    try {
      id = (await kv.get<string>(KEY_BY_HASH(hash))) ?? null;
    } catch {
      return null;
    }
  }
  if (!id) return null;
  const consumer = await getConsumer(id);
  if (!consumer || consumer.revoked) return null;
  return consumer;
}

export async function getConsumer(id: string): Promise<OracleConsumer | null> {
  if (!isKvWired()) return memConsumers.get(id) ?? null;
  try {
    return (await kv.get<OracleConsumer>(KEY_CONSUMER(id))) ?? null;
  } catch {
    return null;
  }
}

export async function revokeConsumer(id: string): Promise<boolean> {
  const consumer = await getConsumer(id);
  if (!consumer) return false;
  const next: OracleConsumer = { ...consumer, revoked: true };
  if (!isKvWired()) {
    memConsumers.set(id, next);
    return true;
  }
  try {
    await kv.set(KEY_CONSUMER(id), next);
    return true;
  } catch {
    return false;
  }
}

export async function listConsumers(): Promise<OracleConsumer[]> {
  let ids: string[];
  if (!isKvWired()) {
    ids = Array.from(memIndex);
  } else {
    try {
      const raw = await kv.smembers<string[]>(KEY_INDEX);
      ids = Array.isArray(raw) ? raw : [];
    } catch {
      ids = [];
    }
  }
  const out: OracleConsumer[] = [];
  for (const id of ids) {
    const c = await getConsumer(id);
    if (c) out.push(c);
  }
  return out;
}

/** Authenticate a request as a consumer (x-oracle-key) OR the global admin token. */
export async function authenticateConsumer(
  req: Request,
): Promise<{ kind: "consumer"; consumer: OracleConsumer } | { kind: "admin" } | null> {
  const admin = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  const presentedAdmin =
    req.headers.get("x-admin-token")?.trim() ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (admin && presentedAdmin && (await constantTimeEqual(presentedAdmin, admin))) {
    return { kind: "admin" };
  }
  const key = req.headers.get("x-oracle-key")?.trim() || "";
  const consumer = await verifyConsumerKey(key);
  if (consumer) return { kind: "consumer", consumer };
  return null;
}

/** Test-only: clear the in-memory fallback stores. */
export function __resetConsumersForTests(): void {
  memByHash.clear();
  memConsumers.clear();
  memIndex.clear();
}
