/**
 * SOAP-backed Constancia Oracle fetcher (`ws_sr_constancia_inscripcion`).
 *
 * # Why this exists
 *
 * The good-standing verdict for Constancia Oracle can come from two real
 * backends (see `packages/constancia/browse-skill/SKILL.md`):
 *
 *   - **Browser** (`BrowseSkillConstanciaFetcher`) — drives the public ARCA
 *     form, returns DATA **and the official PDF**, needs Browserbase.
 *   - **AFIP SOAP** (this file) — `ws_sr_constancia_inscripcion` via
 *     `@ar-agents/identity`, returns the constancia DATA (régimen,
 *     monotributo categoría, domicilio, actividades). No PDF (the SOAP
 *     service exposes no document), no external vendor — just an HTTPS call
 *     from a Node function authenticated with an AFIP X.509 cert. Maximally
 *     Vercel-native.
 *
 * This is the path we light up first: it reuses the already-tested
 * `WsaaWscdcAfipPadronAdapter`, so the only new surface is (1) a pure
 * `AfipPadronData → Constancia` mapping and (2) a KV-backed token store.
 *
 * # The token store matters
 *
 * WSAA hands out a Ticket de Acceso (TA) valid ~12h and REJECTS a request
 * for a new TA while a valid one still exists ("El CEE ya posee un TA
 * valido"). On Vercel every invocation is a fresh process, so an in-memory
 * TA cache would try to mint a TA on every cold start and get throttled.
 * `KvTokenStore` persists the TA in the same KV the rest of the app uses, so
 * all serverless invocations share ONE TA until it expires.
 *
 * # Honesty
 *
 * The fetcher never fabricates a constancia: an unavailable lookup (cert not
 * authorized, AFIP down, CUIT not registered) returns `available: false`
 * with the adapter's actionable message and `source: "padron-soap"`.
 */

import type {
  Constancia,
  ConstanciaActividad,
  ConstanciaFetcher,
  ConstanciaResult,
} from "@ar-agents/constancia";
import { normalizeCuit } from "@ar-agents/constancia";
import type { AfipPadronData } from "@ar-agents/identity";
import {
  WsaaWscdcAfipPadronAdapter,
  type AccessTicket,
  type AfipEnv,
  type TokenStore,
} from "@ar-agents/identity/wsaa";
import { kv } from "@vercel/kv";

// ─────────────────────────────────────────────────────────────────────────────
// KV-backed WSAA token store (shared across serverless invocations)
// ─────────────────────────────────────────────────────────────────────────────

const TA_KEY_PREFIX = "oracle:afip:ta:";
// A TA is valid ~12h; keep the KV copy a little longer as a safety net. The
// adapter overwrites it when it refreshes near expiry, so this only bounds a
// TA the process forgot to refresh.
const TA_TTL_SECONDS = 60 * 60 * 24; // 24h

/**
 * Persists the WSAA Access Ticket in Vercel KV keyed by service name, so a
 * valid TA is reused across cold starts instead of re-minted (and throttled)
 * on every request. Best-effort: a KV outage degrades to "no cached TA",
 * which just means the adapter mints a fresh one.
 */
export class KvTokenStore implements TokenStore {
  async get(service: string): Promise<AccessTicket | null> {
    try {
      const ta = await kv.get<AccessTicket>(`${TA_KEY_PREFIX}${service}`);
      return ta ?? null;
    } catch {
      return null;
    }
  }

  async set(service: string, ta: AccessTicket): Promise<void> {
    try {
      await kv.set(`${TA_KEY_PREFIX}${service}`, ta, { ex: TA_TTL_SECONDS });
    } catch {
      // best-effort; losing the cache only costs a re-login next time
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure mapping: AFIP padrón data → constancia shape
// ─────────────────────────────────────────────────────────────────────────────

/** Infer persona física vs jurídica from the CUIT prefix. */
function tipoPersonaFromCuit(bareCuit: string): Constancia["tipoPersona"] {
  const prefix = bareCuit.slice(0, 2);
  // 30/33/34 = personas jurídicas; 20/23/24/27 = personas físicas.
  return prefix === "30" || prefix === "33" || prefix === "34"
    ? "juridica"
    : "fisica";
}

/**
 * Map AFIP's free-text tax condition onto the coarse `CondicionFiscal` union.
 * Mirrors the browse-skill path's normalization so both backends agree.
 * Unknown text maps to `"desconocida"` rather than guessing.
 */
function mapCondicion(raw: string | null | undefined): Constancia["condicion"] {
  const s = (raw ?? "").toLowerCase();
  if (/monotrib/.test(s)) return "monotributo";
  if (/responsable\s*inscript|resp.*insc|general/.test(s))
    return "responsable_inscripto";
  if (/exent/.test(s)) return "exento";
  if (/no\s*alcanzad|no\s*responsable|consumidor\s*final/.test(s))
    return "no_alcanzado";
  if (/no\s*inscript|sin\s*inscrip/.test(s)) return "no_inscripto";
  return "desconocida";
}

/** Best-effort ISO `YYYY-MM-DD`; accepts ISO or `DD/MM/YYYY`, else undefined. */
function isoDate(v: string | null | undefined): string | undefined {
  const s = (v ?? "").trim();
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return undefined;
}

/**
 * Pure, side-effect-free mapping from `@ar-agents/identity`'s padrón result
 * to the `@ar-agents/constancia` `Constancia` shape. Exported for unit tests.
 *
 * Lossy by construction (the SOAP A5 service is thinner than the PDF):
 *   - `domicilioFiscal` arrives as one string → `{ direccion }`.
 *   - `actividades` arrive as descriptions only → `codigo: ""`, first marked
 *     `principal`.
 *   - `estado` / `impuestos` are not in the A5 payload → omitted.
 */
export function mapPadronToConstancia(
  bareCuit: string,
  data: AfipPadronData,
): Constancia {
  const out: Constancia = {
    cuit: bareCuit,
    denominacion: data.nombre,
    tipoPersona: tipoPersonaFromCuit(bareCuit),
    condicion: mapCondicion(data.condicion),
  };

  if (data.monotributoCategoria) {
    out.monotributoCategoria = String(data.monotributoCategoria).toUpperCase();
  }

  const dir = (data.domicilioFiscal ?? "").trim();
  if (dir) out.domicilioFiscal = { direccion: dir };

  const acts: ConstanciaActividad[] = (data.actividades ?? [])
    .map((d) => (typeof d === "string" ? d.trim() : ""))
    .filter((d) => d.length > 0)
    .map((descripcion, i) => ({ codigo: "", descripcion, principal: i === 0 }));
  if (acts.length > 0) out.actividades = acts;

  const fecha = isoDate(data.fechaInscripcion);
  if (fecha) out.fechaInscripcion = fecha;

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The fetcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A `ConstanciaFetcher` backed by AFIP's SOAP `ws_sr_constancia_inscripcion`
 * webservice via `WsaaWscdcAfipPadronAdapter`. DATA only, no PDF, no vendor.
 */
export class SoapConstanciaFetcher implements ConstanciaFetcher {
  private readonly adapter: WsaaWscdcAfipPadronAdapter;

  constructor(adapter: WsaaWscdcAfipPadronAdapter) {
    this.adapter = adapter;
  }

  async getConstancia(cuit: string): Promise<ConstanciaResult> {
    const bare = normalizeCuit(cuit);
    if (!bare) {
      return {
        cuit,
        available: false,
        error: `invalid_cuit: "${cuit}" no tiene 11 dígitos.`,
        data: null,
        pdf: null,
        source: "padron-soap",
      };
    }

    const res = await this.adapter.lookup(bare);
    if (!res.available || !res.data) {
      return {
        cuit: bare,
        available: false,
        error:
          res.error ??
          `El CUIT ${bare} no figura inscripto en ARCA o la consulta no estuvo disponible.`,
        data: null,
        pdf: null,
        source: "padron-soap",
      };
    }

    return {
      cuit: bare,
      available: true,
      error: null,
      data: mapPadronToConstancia(bare, res.data),
      pdf: null, // the SOAP service exposes no PDF artifact
      source: "padron-soap",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Env wiring
// ─────────────────────────────────────────────────────────────────────────────

/** True when every env var the SOAP fetcher needs is present. */
export function isSoapConfigured(): boolean {
  return Boolean(
    process.env.AFIP_CERT_PEM?.trim() &&
      process.env.AFIP_KEY_PEM?.trim() &&
      process.env.AFIP_CUIT?.trim(),
  );
}

/**
 * Construct the SOAP fetcher from env, or `null` when unconfigured.
 *
 * Env contract (serverless / Vercel):
 *   - `AFIP_CERT_PEM`  — the X.509 cert PEM AFIP issued for the alias.
 *   - `AFIP_KEY_PEM`   — the matching RSA private key PEM.
 *   - `AFIP_CUIT`      — the CUIT whose Clave Fiscal authorized the cert.
 *   - `AFIP_ENV`       — "prod" (default) or "homo".
 *
 * The cert must be authorized for `ws_sr_constancia_inscripcion` in AFIP's
 * "Administrador de Relaciones". Until `AFIP_CERT_PEM` is set the fetcher is
 * absent and Constancia Oracle stays honestly premium-gated.
 */
export function soapFetcherFromEnv(): SoapConstanciaFetcher | null {
  if (!isSoapConfigured()) return null;
  const env: AfipEnv = process.env.AFIP_ENV === "homo" ? "homo" : "prod";
  const adapter = new WsaaWscdcAfipPadronAdapter({
    certPem: process.env.AFIP_CERT_PEM!,
    keyPem: process.env.AFIP_KEY_PEM!,
    cuitRepresentado: process.env.AFIP_CUIT!,
    env,
    tokenStore: new KvTokenStore(),
    // service defaults to ws_sr_constancia_inscripcion (full constancia).
  });
  return new SoapConstanciaFetcher(adapter);
}
