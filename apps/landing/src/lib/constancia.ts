/**
 * Constancia Oracle wiring: fetcher selection + acquisition instrumentation.
 *
 * # The honest front-half / back-half split
 *
 * Constancia Oracle has two tiers:
 *
 *   - **Free, always-on**: instant CUIT check-digit validation from
 *     `@ar-agents/identity` (pure mod-11, no secret, no network). This is
 *     what powers the lookup endpoint and the badge today.
 *   - **Premium, gated**: the REAL ARCA good-standing constancia from
 *     `@ar-agents/constancia`. ARCA's constancia has no API, so it is
 *     browser-backed and needs a Browserbase fetcher (a secret we do NOT
 *     have yet). Until that fetcher is wired, the good-standing verdict
 *     returns an honest "premium / not configured" state, NEVER a fake
 *     verdict.
 *
 * `getConstanciaFetcher()` is the single seam. It returns the unconfigured
 * fetcher by default. The day a Browserbase runtime exists, wire
 * `BrowseSkillConstanciaFetcher` here (reading `runSkill` from env / a
 * queue) and EVERY route that calls this lights up the real verdict with
 * zero route changes.
 *
 * # Acquisition instrumentation (the experiment)
 *
 * Constancia Oracle is experiment #1 in a research program on
 * autonomous-business customer acquisition. The single most important
 * thing we measure is whether the shareable badge loop propagates
 * (k-factor): which external domains embed the badge, and which channel
 * drove each lookup. `recordConstanciaEvent` captures that into the same
 * ephemeral KV store the rest of the app uses, degrading to a no-op when
 * KV is absent so it can NEVER throw on the request path.
 */

import { kv } from "@vercel/kv";
import {
  type ConstanciaFetcher,
  UnconfiguredConstanciaFetcher,
} from "@ar-agents/constancia";
import { isSoapConfigured, soapFetcherFromEnv } from "./afip-constancia-soap";

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher selection (the swap seam)
// ─────────────────────────────────────────────────────────────────────────────

let cachedFetcher: ConstanciaFetcher | null = null;

/**
 * The constancia good-standing fetcher in use on THIS deployment.
 *
 * Resolution order (first configured wins):
 *
 *   1. **AFIP SOAP** (`ws_sr_constancia_inscripcion`) when `AFIP_CERT_PEM` +
 *      `AFIP_KEY_PEM` + `AFIP_CUIT` are set. Real DATA verdict, no PDF, no
 *      external vendor — the maximally Vercel-native path. See
 *      `./afip-constancia-soap`.
 *   2. **Browserbase** (`BrowseSkillConstanciaFetcher`) — the future path to
 *      the official PDF artifact, wired behind `BROWSERBASE_API_KEY`.
 *   3. **Unconfigured** — honest premium-gating: `getConstancia()` returns
 *      `{ available: false }` with an actionable message, never a fake
 *      verdict.
 *
 * Every route calls this seam, so lighting up a backend needs NO route
 * change — only the env vars.
 */
export function getConstanciaFetcher(): ConstanciaFetcher {
  if (cachedFetcher) return cachedFetcher;

  // 1. AFIP SOAP — real DATA verdict, no vendor. Preferred when configured.
  const soap = soapFetcherFromEnv();
  if (soap) {
    cachedFetcher = soap;
    return cachedFetcher;
  }

  // 2. Browserbase (adds the PDF tier). Future:
  //   if (process.env.BROWSERBASE_API_KEY) {
  //     cachedFetcher = new BrowseSkillConstanciaFetcher({
  //       runSkill: (cuit) => runAfipConstanciaSkill(cuit),
  //     });
  //     return cachedFetcher;
  //   }

  // 3. Honest premium-gating.
  cachedFetcher = new UnconfiguredConstanciaFetcher();
  return cachedFetcher;
}

/** Whether a REAL good-standing fetcher is wired (vs the unconfigured stub). */
export function isFetcherConfigured(): boolean {
  // Mirror the resolution order in getConstanciaFetcher.
  return isSoapConfigured();
}

// ─────────────────────────────────────────────────────────────────────────────
// Acquisition instrumentation
// ─────────────────────────────────────────────────────────────────────────────

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() &&
      process.env.KV_REST_API_TOKEN?.trim(),
  );
}

/** Strip a referer/URL to its bare host. Never throws; "" when unparseable. */
export function refererHost(referer: string | null | undefined): string {
  if (!referer) return "";
  try {
    return new URL(referer).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The acquisition signals we attach to every Constancia Oracle event so we
 * can attribute which channel drove a lookup and which domains embed the
 * badge. All fields optional, all best-effort.
 */
export interface Attribution {
  /** utm_source query param (e.g. "twitter", "newsletter"). */
  utmSource?: string;
  /** utm_medium query param (e.g. "post", "email"). */
  utmMedium?: string;
  /** generic `ref` query param. */
  ref?: string;
  /** Bare host of the Referer header (the embedding/linking domain). */
  refererHost?: string;
}

/** Pull attribution from a request: UTM/ref query params + Referer header. */
export function extractAttribution(req: Request): Attribution {
  const out: Attribution = {};
  try {
    const sp = new URL(req.url).searchParams;
    const src = sp.get("utm_source")?.trim();
    const med = sp.get("utm_medium")?.trim();
    const ref = sp.get("ref")?.trim();
    if (src) out.utmSource = src.slice(0, 120);
    if (med) out.utmMedium = med.slice(0, 120);
    if (ref) out.ref = ref.slice(0, 120);
  } catch {
    // malformed URL → no query attribution
  }
  const host = refererHost(req.headers.get("referer"));
  if (host) out.refererHost = host.slice(0, 253);
  return out;
}

export type ConstanciaEventKind = "lookup" | "badge" | "proof_view";

/**
 * Record one Constancia Oracle event into the ephemeral KV store.
 *
 * Two things land per call, both best-effort and both behind try/catch so a
 * KV outage degrades to a no-op and NEVER throws on the request path:
 *
 *   1. A rolling capped list of recent events (`oracle:events:<kind>`) for
 *      ad-hoc inspection of the acquisition funnel.
 *   2. Aggregate counters that answer the experiment's core questions:
 *        - `oracle:k:referer` (hash) - count per embedding/linking host.
 *          THIS is the k-factor instrument: which external domains carry
 *          the badge out into the world.
 *        - `oracle:k:utm_source` (hash) - count per acquisition channel.
 *
 * When KV is unwired (local dev, PR previews without secrets) this is a
 * silent no-op: the surface still works, we just don't accrue metrics.
 */
export async function recordConstanciaEvent(
  kind: ConstanciaEventKind,
  cuit: string,
  attribution: Attribution,
): Promise<void> {
  if (!isKvWired()) return;
  const at = new Date().toISOString();
  try {
    const event = { kind, cuit, at, ...attribution };
    // Rolling capped list (keep the last ~500 per kind; trim on each push).
    const listKey = `oracle:events:${kind}`;
    await kv.rpush(listKey, event);
    await kv.ltrim(listKey, -500, -1);

    // Aggregate k-factor counters. A missing field just isn't counted.
    if (attribution.refererHost) {
      await kv.hincrby("oracle:k:referer", attribution.refererHost, 1);
    }
    if (attribution.utmSource) {
      await kv.hincrby("oracle:k:utm_source", attribution.utmSource, 1);
    }
  } catch {
    // KV down / quota → drop the metric, never fail the request.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup result caching (by CUIT)
// ─────────────────────────────────────────────────────────────────────────────

const LOOKUP_CACHE_TTL_SECONDS = 60 * 60; // 1h
// Versioned: bump when the cached LookupPayload shape changes so stale entries
// from an older deploy are never served (v2 added the signed `attestation`).
const LOOKUP_CACHE_PREFIX = "oracle:lookup:v2:";

/** Read a cached lookup payload for a bare CUIT. `null` on miss / no KV. */
export async function readCachedLookup<T>(cuit: string): Promise<T | null> {
  if (!isKvWired()) return null;
  try {
    return (await kv.get<T>(`${LOOKUP_CACHE_PREFIX}${cuit}`)) ?? null;
  } catch {
    return null;
  }
}

/** Cache a lookup payload by bare CUIT for 1h. Best-effort, never throws. */
export async function writeCachedLookup<T>(
  cuit: string,
  payload: T,
): Promise<void> {
  if (!isKvWired()) return;
  try {
    await kv.set(`${LOOKUP_CACHE_PREFIX}${cuit}`, payload, {
      ex: LOOKUP_CACHE_TTL_SECONDS,
    });
  } catch {
    // best-effort
  }
}
