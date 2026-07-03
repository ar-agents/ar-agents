/**
 * `GET|POST /api/constancia/lookup`, the free Constancia Oracle lookup.
 *
 * Two tiers, honestly separated (see src/lib/constancia.ts):
 *
 *   - ALWAYS free: instant CUIT check-digit validation via
 *     `@ar-agents/identity` `parseCuit` (pure mod-11, no secret, no network).
 *   - PREMIUM, gated: the REAL ARCA good-standing constancia via
 *     `@ar-agents/constancia`. The default `UnconfiguredConstanciaFetcher`
 *     returns `available:false` with an actionable message, so the verdict
 *     is honestly premium-gated, NOT a fabricated good-standing. The day a
 *     Browserbase fetcher is wired in `getConstanciaFetcher`, the SAME shape
 *     carries the real verdict, no route change.
 *
 * Response shape (free tier, fetcher unconfigured):
 *   { cuit, valid, formatted, goodStanding: null, verdictAvailable: false, reason }
 * When a fetcher is present, `goodStanding`/`verdictAvailable` reflect the
 * real `ConstanciaResult`.
 *
 * Instrumentation (the experiment): every lookup records UTM/ref query params
 * and the Referer header so we can attribute which acquisition channel drove
 * it. Degrades to a no-op when KV is absent, never throws.
 *
 * Conventions reused 1:1 from /api/x402/cuit and /api/auditor/*: rate limiting
 * (@/lib/ratelimit), CORS (@/lib/cors), audit logging (@/lib/audit). Results
 * are cached by CUIT for 1h.
 *
 * Runtime: nodejs (matches the KV-backed dashboard pages - @vercel/kv +
 * @ar-agents/constancia are comfortably under the Node budget; Edge's 1MB cap
 * is tight once KV's transitive deps are in).
 */

import { parseCuit } from "@ar-agents/identity";
import { normalizeCuit } from "@ar-agents/constancia";
import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { appendAudit } from "@/lib/audit";
import {
  extractAttribution,
  getConstanciaFetcher,
  isFetcherConfigured,
  readCachedLookup,
  recordConstanciaEvent,
  writeCachedLookup,
} from "@/lib/constancia";
import {
  buildConstanciaAttestation,
  type ConstanciaAttestation,
  type ConstanciaGoodStanding,
} from "@/lib/constancia-attestation";

export const runtime = "nodejs";

const RL_MAX = 30;
const RL_WINDOW_MS = 60_000;

interface LookupPayload {
  cuit: string;
  /** Check-digit validity (the always-free verdict). */
  valid: boolean;
  /** Pretty `XX-XXXXXXXX-X`, or the raw normalized digits when not 11-long. */
  formatted: string;
  /** Inferred person type from the prefix (persona física / jurídica). */
  personType: string;
  /** Spanish validation error to surface verbatim, null when valid. */
  validationError: string | null;
  /**
   * Real ARCA good-standing data when a fetcher is wired; `null` while the
   * premium verdict is gated (today's default).
   */
  goodStanding: unknown;
  /** True only when a real good-standing verdict was produced. */
  verdictAvailable: boolean;
  /** Why the verdict is/ isn't available (actionable). */
  reason: string | null;
  /** Convenience links for the shareable surfaces. */
  proofUrl: string;
  badgeUrl: string;
  /**
   * Ed25519-signed attestation of this result (the "Firmada" guarantee).
   * `null` only when no signing key is configured. The signature covers the
   * check-digit verdict always, and the good-standing verdict only when real.
   * Verifiable offline against /.well-known/sociedad-ia/keys.
   */
  attestation: ConstanciaAttestation | null;
}

async function extractCuit(req: Request): Promise<string | null> {
  if (req.method === "GET") {
    return new URL(req.url).searchParams.get("cuit");
  }
  try {
    const body = (await req.json()) as { cuit?: unknown };
    return typeof body.cuit === "string" ? body.cuit : null;
  } catch {
    return null;
  }
}

async function handle(req: Request): Promise<Response> {
  if (!rateLimit("constancia-lookup", clientIp(req), RL_MAX, RL_WINDOW_MS)) {
    return jsonCors(
      { error: "rate_limited", note: "30 consultas por minuto por IP." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const rawCuit = await extractCuit(req);
  if (!rawCuit) {
    return jsonCors(
      {
        error: "bad_request",
        note: 'Pasá ?cuit=XX-XXXXXXXX-X (GET) o JSON { "cuit": "..." } (POST).',
      },
      { status: 400 },
    );
  }

  // Free, instant, no-secret check-digit validation.
  const parsed = parseCuit(rawCuit);
  const bare = normalizeCuit(rawCuit) ?? parsed.normalized;

  // Attribution: which channel drove this lookup (the experiment metric).
  const attribution = extractAttribution(req);

  // Cache by CUIT for 1h. The free verdict is deterministic; while the
  // premium fetcher is unconfigured the good-standing half is constant too.
  const cached = await readCachedLookup<LookupPayload>(bare);
  if (cached) {
    // Still record the acquisition signal even on a cache hit, that is the
    // point of the experiment, then short-circuit the work.
    await recordConstanciaEvent("lookup", bare, attribution);
    return jsonCors({ ok: true, cached: true, result: cached });
  }

  // Premium good-standing via the constancia package. Default fetcher is
  // unconfigured → available:false with an honest "configure a fetcher"
  // message. A real fetcher (Browserbase) lights this up with zero changes.
  let goodStanding: unknown = null;
  let verdictAvailable = false;
  let reason: string | null = null;
  let attGoodStanding: ConstanciaGoodStanding | null = null;
  if (parsed.valid) {
    try {
      const fetcher = getConstanciaFetcher();
      const constancia = await fetcher.getConstancia(bare);
      verdictAvailable = constancia.available;
      goodStanding = constancia.available ? constancia.data : null;
      if (constancia.available && constancia.data) {
        // Only real backends set available:true here (padron-soap / browse-skill).
        attGoodStanding = {
          source:
            constancia.source === "browse-skill" ? "browse-skill" : "padron-soap",
          condicion: constancia.data.condicion,
          ...(constancia.data.denominacion
            ? { denominacion: constancia.data.denominacion }
            : {}),
          ...(constancia.data.estado ? { estado: constancia.data.estado } : {}),
        };
      }
      reason = constancia.available
        ? null
        : isFetcherConfigured()
          ? constancia.error
          : "Verdicto de buena situación fiscal premium. Todavía no hay un fetcher de ARCA configurado en este deployment.";
    } catch {
      reason = "El servicio de constancia no respondió. Probá de nuevo.";
    }
  } else {
    reason =
      "No consultamos ARCA porque el CUIT no pasa el dígito verificador. Corregí el CUIT.";
  }

  // Sign the result (the "Firmada" guarantee). Covers the check-digit verdict
  // always, and the good-standing verdict only when real. null if no key.
  const attestation = await buildConstanciaAttestation({
    cuit: bare,
    checkDigitValid: parsed.valid,
    goodStanding: attGoodStanding,
  });

  const result: LookupPayload = {
    cuit: bare,
    valid: parsed.valid,
    formatted: parsed.formatted ?? bare,
    personType: parsed.personType,
    validationError: parsed.error,
    goodStanding,
    verdictAvailable,
    reason,
    proofUrl: `https://ar-agents.ar/constancia/${bare}`,
    badgeUrl: `https://ar-agents.ar/api/constancia/badge/${bare}`,
    attestation,
  };

  await writeCachedLookup(bare, result);

  // Forensic trail, same as every other hosted surface; never fails the call.
  try {
    await appendAudit(
      `constancia-public-${new Date().toISOString().slice(0, 10)}`,
      {
        tool: "constancia_lookup",
        governance: "algorithm-only",
        input: { cuit: rawCuit, attribution },
        output: { valid: result.valid, verdictAvailable, personType: result.personType },
      },
    );
  } catch {
    // best-effort
  }

  // Acquisition instrumentation (the experiment): UTM/ref + Referer.
  await recordConstanciaEvent("lookup", bare, attribution);

  return jsonCors({ ok: true, cached: false, result });
}

export { handle as GET, handle as POST };

export function OPTIONS(): Response {
  return preflight();
}
