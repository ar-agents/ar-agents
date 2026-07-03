/**
 * Public, honest readout of the Constancia Oracle acquisition experiment.
 *
 * The k-factor instrument (`recordConstanciaEvent` in ./constancia.ts) counts
 * badge renders per Referer host and lookups per utm_source. This module
 * turns those raw counters into a CLASSIFIED, transparent reading:
 *
 *   - `owned`     — ar-agents' own domains + deploy previews. Not acquisition.
 *   - `seed`      — embeds we placed ourselves. Policy: every seed carries
 *                   `utm_source=seed-<surface>` in the badge URL, so seeds are
 *                   self-identifying and can NEVER inflate the organic number.
 *   - `proxy`     — image proxies (GitHub camo) that hide the real embedder.
 *                   Untagged proxy hits are counted as external-but-unattributed.
 *   - `synthetic` — known test hits injected during verification (discounted).
 *   - `external`  — everything else: the ONLY bucket that counts toward k.
 *
 * Publishing this classification (including the zeros) is the experiment's
 * honesty guarantee, the same rule as "never self-pay to inflate usage": the
 * seed traffic is visible, labeled, and excluded from the headline number.
 */

import { kv } from "@vercel/kv";

export type RefererClass = "owned" | "proxy" | "synthetic" | "external";

/** ar-agents' own surfaces. Traffic from here is dogfood, not acquisition. */
const OWNED_HOSTS = new Set([
  "ar-agents.ar",
  "www.ar-agents.ar",
  "localhost",
  "127.0.0.1",
]);

/** Image proxies that strip/replace the embedder's Referer. */
const PROXY_HOSTS = new Set(["camo.githubusercontent.com"]);

/** Known test hits injected during deploy verification. Discounted. */
const SYNTHETIC_HOSTS = new Set(["example.com", "www.example.com"]);

/** Pure. Classify one referer host. Exported for tests. */
export function classifyHost(host: string): RefererClass {
  const h = host.toLowerCase();
  if (OWNED_HOSTS.has(h)) return "owned";
  if (h.endsWith(".vercel.app")) return "owned"; // our deploy previews
  if (PROXY_HOSTS.has(h)) return "proxy";
  if (SYNTHETIC_HOSTS.has(h)) return "synthetic";
  return "external";
}

/** Pure. Whether a utm_source marks a seed we placed ourselves. */
export function isSeedSource(utmSource: string): boolean {
  return utmSource.toLowerCase().startsWith("seed-");
}

export interface ConstanciaMetrics {
  /** Raw event counts per kind (rolling capped lists, so ">= shown"). */
  events: { lookup: number; badge: number; proof_view: number };
  /** Badge referer hosts, classified. */
  refererHosts: Array<{ host: string; count: number; class: RefererClass }>;
  /** Lookup/badge channels from utm_source; seeds flagged. */
  channels: Array<{ source: string; count: number; seed: boolean }>;
  /**
   * THE headline number: distinct external (non-owned, non-seed,
   * non-synthetic) domains that embedded the badge. Proxy hits are listed
   * but reported separately because the true embedder is unknown.
   */
  kFactor: {
    externalHosts: string[];
    externalDistinct: number;
    proxyHits: number;
  };
  methodology: string;
}

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() &&
      process.env.KV_REST_API_TOKEN?.trim(),
  );
}

const METHODOLOGY =
  "k cuenta SOLO dominios externos: se excluyen los dominios propios de ar-agents, los previews de deploy, los hits de prueba conocidos y todo embed sembrado por nosotros (los seeds llevan utm_source=seed-* y se reportan aparte). Los proxies de imagen (GitHub camo) ocultan al embebedor real y se reportan como proxy. La lista de eventos es una ventana rodante, los contadores por host/canal son acumulativos. Cero es un resultado publicable.";

/** Read + classify the live counters. Null when KV is not wired. */
export async function readConstanciaMetrics(): Promise<ConstanciaMetrics | null> {
  if (!isKvWired()) return null;
  try {
    const [lookupLen, badgeLen, proofLen, refererHash, utmHash] =
      await Promise.all([
        kv.llen("oracle:events:lookup"),
        kv.llen("oracle:events:badge"),
        kv.llen("oracle:events:proof_view"),
        kv.hgetall<Record<string, number>>("oracle:k:referer"),
        kv.hgetall<Record<string, number>>("oracle:k:utm_source"),
      ]);

    const refererHosts = Object.entries(refererHash ?? {})
      .map(([host, count]) => ({
        host,
        count: Number(count) || 0,
        class: classifyHost(host),
      }))
      .sort((a, b) => b.count - a.count);

    const channels = Object.entries(utmHash ?? {})
      .map(([source, count]) => ({
        source,
        count: Number(count) || 0,
        seed: isSeedSource(source),
      }))
      .sort((a, b) => b.count - a.count);

    const externalHosts = refererHosts
      .filter((r) => r.class === "external")
      .map((r) => r.host);
    const proxyHits = refererHosts
      .filter((r) => r.class === "proxy")
      .reduce((acc, r) => acc + r.count, 0);

    return {
      events: {
        lookup: lookupLen ?? 0,
        badge: badgeLen ?? 0,
        proof_view: proofLen ?? 0,
      },
      refererHosts,
      channels,
      kFactor: {
        externalHosts,
        externalDistinct: externalHosts.length,
        proxyHits,
      },
      methodology: METHODOLOGY,
    };
  } catch {
    return null;
  }
}
