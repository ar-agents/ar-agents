/**
 * IIBB adapter contract.
 *
 * Each jurisdiction has its own portal / API / verification flow. The
 * adapter interface keeps the tool layer jurisdiction-agnostic; a host
 * wires in one adapter per regime they actually need.
 *
 * v0.2 ships:
 *   UnconfiguredIibbAdapter   throws on every operation. Default. Safe
 *                             for unit tests that exercise only the pure
 *                             calculation primitives.
 *   HttpPadronAdapter         abstract base. Subclasses parameterize a
 *                             URL + a response parser; the host injects a
 *                             fetch function (so tests stay offline and
 *                             rate-limited prod traffic stays under the
 *                             host's control). lookupPadron is real,
 *                             submitDdjj still throws (no jurisdiction
 *                             ships a documented API for DDJJ upload).
 *   AgipPublicAdapter         CABA. Uses AGIP's public consulta endpoint
 *                             (no auth required for read-only padrón
 *                             status). Auth-gated rate lookups are out
 *                             of scope here (use a CIT-backed subclass).
 *   ArbaCitAdapter            Provincia de Buenos Aires. Hits the ARBA
 *                             dfe service. Requires a CIT-authenticated
 *                             fetcher (host wires their own credentialed
 *                             HTTPS client; this package never stores
 *                             credentials).
 *   ConvenioMultilateralStubAdapter   CM stays a stub in v0.2: SIRCAR's
 *                             API surface is CIT-gated and undocumented
 *                             enough that we won't pretend to support
 *                             it from package code; ship the consulta
 *                             via your own Comarb-credentialed adapter.
 *
 * Hosts can implement custom adapters by satisfying this interface
 * (e.g. a Vultur-managed adapter that proxies through Vultur's own
 * stored ARBA / AGIP credentials).
 */
import type { JurisdictionCode, Padron } from "./types";
import { IibbUnconfiguredError } from "./errors";

export interface IibbAdapter {
  /** The jurisdiction this adapter serves. */
  readonly jurisdiction: JurisdictionCode;

  /**
   * Look up a CUIT's taxpayer status in this jurisdiction. Returns null
   * if the taxpayer is not found in the padrón.
   */
  lookupPadron(cuit: string): Promise<Padron | null>;

  /**
   * Submit a monthly DDJJ to the jurisdiction's portal. Returns an
   * opaque submission receipt id. For jurisdictions without API
   * submission, this throws IibbUnconfiguredError.
   */
  submitDdjj(ddjjPayload: unknown): Promise<{ receiptId: string }>;
}

abstract class StubAdapter implements IibbAdapter {
  abstract readonly jurisdiction: JurisdictionCode;
  protected readonly label: string;

  protected constructor(label: string) {
    this.label = label;
  }

  async lookupPadron(): Promise<never> {
    throw new IibbUnconfiguredError("lookupPadron", this.label);
  }
  async submitDdjj(): Promise<never> {
    throw new IibbUnconfiguredError("submitDdjj", this.label);
  }
}

/** Default. Throws on every call. Safe for unit tests. */
export class UnconfiguredIibbAdapter extends StubAdapter {
  readonly jurisdiction: JurisdictionCode;

  constructor(jurisdiction: JurisdictionCode) {
    super(`unconfigured (${jurisdiction})`);
    this.jurisdiction = jurisdiction;
  }
}

// ── HTTP base ────────────────────────────────────────────────────

/**
 * Minimal fetch-like signature the adapters depend on. The host can
 * pass `globalThis.fetch`, a credentialed wrapper, or a mock for tests.
 */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface HttpPadronAdapterOptions {
  /** Fetcher to use. Defaults to globalThis.fetch when available. */
  fetch?: FetchLike;
  /** Per-request timeout in ms. Default 12_000. */
  timeoutMs?: number;
  /** Custom User-Agent. Default identifies @ar-agents/iibb. */
  userAgent?: string;
}

const DEFAULT_UA = "@ar-agents/iibb (https://ar-agents.ar)";

/**
 * Abstract HTTP-backed padron adapter. Subclasses define:
 *   - jurisdiction
 *   - buildLookupRequest(cuit): { url, method, headers?, body? }
 *   - parseLookupResponse(responseText, cuit): Padron | null
 *
 * The base class handles fetch dispatch, timeout, network errors, HTTP
 * status errors, and converts them into IibbAdapter errors. The
 * subclass owns nothing but the jurisdiction-specific protocol.
 */
export abstract class HttpPadronAdapter implements IibbAdapter {
  abstract readonly jurisdiction: JurisdictionCode;
  protected readonly fetcher: FetchLike;
  protected readonly timeoutMs: number;
  protected readonly userAgent: string;

  protected constructor(opts: HttpPadronAdapterOptions = {}) {
    const f = opts.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!f) {
      throw new IibbUnconfiguredError(
        "fetch",
        "no fetch function available (pass `fetch` in HttpPadronAdapterOptions or polyfill globalThis.fetch)",
      );
    }
    this.fetcher = f;
    this.timeoutMs = opts.timeoutMs ?? 12_000;
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
  }

  /** Subclass: build the HTTP request for a padrón lookup. */
  protected abstract buildLookupRequest(cuit: string): {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  /**
   * Subclass: parse the jurisdiction-specific response. Return null
   * when the taxpayer is not registered. Throw IibbUnconfiguredError
   * if the response shape is unrecognized (don't silently return null
   * — that hides a regulator-side schema change).
   */
  protected abstract parseLookupResponse(
    responseText: string,
    cuit: string,
  ): Padron | null;

  async lookupPadron(cuit: string): Promise<Padron | null> {
    const req = this.buildLookupRequest(cuit);
    const headers: Record<string, string> = {
      "user-agent": this.userAgent,
      ...req.headers,
    };
    let res;
    try {
      res = await this.withTimeout(
        this.fetcher(req.url, {
          method: req.method ?? "GET",
          headers,
          ...(req.body !== undefined ? { body: req.body } : {}),
        }),
      );
    } catch (err) {
      throw new IibbUnconfiguredError(
        "lookupPadron",
        `${this.jurisdiction} HTTP error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      // 404 from jurisdiction = taxpayer not found (don't conflate
      // with adapter being broken). Some jurisdictions return 200 with
      // an empty body for "not found"; that's the subclass's job to
      // recognize via parseLookupResponse.
      if (res.status === 404) return null;
      throw new IibbUnconfiguredError(
        "lookupPadron",
        `${this.jurisdiction} returned HTTP ${res.status}`,
      );
    }
    const text = await res.text();
    return this.parseLookupResponse(text, cuit);
  }

  async submitDdjj(): Promise<never> {
    throw new IibbUnconfiguredError(
      "submitDdjj",
      `${this.jurisdiction} DDJJ submission is not exposed via this package; use the jurisdiction's official portal or a custom adapter`,
    );
  }

  private async withTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timeout after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );
    });
    try {
      return await Promise.race([p, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

// ── Concrete: AGIP (CABA) ────────────────────────────────────────

/**
 * AGIP public-padron adapter for CABA (Ciudad Autónoma de Buenos
 * Aires).
 *
 * AGIP exposes a public consulta endpoint (no CIT required) that
 * confirms whether a CUIT is registered as a CABA IIBB contributor.
 * It does NOT expose alícuotas; rate lookups require AGIP "Mis
 * Servicios" credentials and live in a separate adapter.
 *
 * Endpoint override is supported because AGIP has migrated the
 * consulta path multiple times (lb.agip.gob.ar → www.agip.gob.ar)
 * and hosts may need to route through their own proxy.
 */
export interface AgipPublicAdapterOptions extends HttpPadronAdapterOptions {
  /** Override the consulta URL template. `{cuit}` is interpolated. */
  endpointTemplate?: string;
}

const AGIP_DEFAULT_ENDPOINT =
  "https://www.agip.gob.ar/recaudacion/padron-iibb/consulta-padron?cuit={cuit}";

export class AgipPublicAdapter extends HttpPadronAdapter {
  readonly jurisdiction: JurisdictionCode = "CABA";
  private readonly endpointTemplate: string;

  constructor(opts: AgipPublicAdapterOptions = {}) {
    super(opts);
    this.endpointTemplate = opts.endpointTemplate ?? AGIP_DEFAULT_ENDPOINT;
  }

  protected buildLookupRequest(cuit: string) {
    return {
      url: this.endpointTemplate.replace("{cuit}", encodeURIComponent(cuit)),
      method: "GET",
      headers: { accept: "application/json, text/plain, */*" },
    };
  }

  protected parseLookupResponse(text: string, cuit: string): Padron | null {
    // AGIP's response surface varies (JSON vs HTML form). We accept
    // both: JSON shape `{ inscripto: bool, ... }` OR an HTML page that
    // contains the literal "no se encuentra inscripto" / "inscripto"
    // tokens. Either way, we extract a binary "inscribed" flag.
    const lower = text.toLowerCase();
    // Try JSON first.
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const inscribed =
        j["inscripto"] === true ||
        j["estado"] === "INSCRIPTO" ||
        j["status"] === "active";
      if (
        j["inscripto"] === false ||
        j["estado"] === "NO_INSCRIPTO" ||
        j["status"] === "inactive"
      ) {
        return null;
      }
      if (inscribed) {
        return {
          cuit,
          jurisdiction: "CABA",
          inscribed: true,
          regime: typeof j["regimen"] === "string" && j["regimen"] === "CM"
            ? "cm"
            : "local",
          inscriptionNumber:
            typeof j["nroInscripcion"] === "string"
              ? j["nroInscripcion"]
              : undefined,
        };
      }
    } catch {
      // Fall through to HTML heuristic.
    }
    if (
      lower.includes("no se encuentra inscripto") ||
      lower.includes("no inscripto") ||
      lower.includes("no registrado")
    ) {
      return null;
    }
    if (lower.includes("inscripto") || lower.includes("contribuyente")) {
      return {
        cuit,
        jurisdiction: "CABA",
        inscribed: true,
        regime: lower.includes("convenio multilateral") ? "cm" : "local",
      };
    }
    // Unrecognized response — surface as unconfigured rather than
    // silently lie. The host can override parseLookupResponse if AGIP
    // changes its surface again.
    throw new IibbUnconfiguredError(
      "parseLookupResponse",
      `AGIP response did not match known shapes (${text.length} bytes); override parseLookupResponse in a subclass to teach the adapter`,
    );
  }
}

// ── Concrete: ARBA (BSAS) ────────────────────────────────────────

/**
 * ARBA CIT-authenticated padron adapter for Provincia de Buenos Aires.
 *
 * ARBA exposes its padrón through the dfe (Domicilio Fiscal
 * Electrónico) service at:
 *   https://dfe.arba.gov.ar/DomicilioElectronico/SeguridadCliente/
 *
 * Read-access requires a CIT (Clave de Identificación Tributaria),
 * NOT an AFIP fiscal clave. The host is responsible for stamping the
 * CIT cookie / token onto the request — this adapter delegates to a
 * host-provided fetcher that already carries the auth.
 *
 * If you don't have a CIT-authenticated fetcher yet, see ARBA's
 * "Domicilio Fiscal Electrónico" portal to enroll.
 */
export interface ArbaCitAdapterOptions extends HttpPadronAdapterOptions {
  /** Override the dfe endpoint. `{cuit}` is interpolated. */
  endpointTemplate?: string;
  /**
   * REQUIRED: a fetch wrapper that adds CIT auth (cookie or signed
   * token) to every request. If you pass plain globalThis.fetch you'll
   * get HTTP 401/403 from ARBA — pass an authenticated wrapper.
   */
  fetch: FetchLike;
}

const ARBA_DEFAULT_ENDPOINT =
  "https://dfe.arba.gov.ar/DomicilioElectronico/SeguridadCliente/dfeServicioConsulta.do?cuit={cuit}";

export class ArbaCitAdapter extends HttpPadronAdapter {
  readonly jurisdiction: JurisdictionCode = "BSAS";
  private readonly endpointTemplate: string;

  constructor(opts: ArbaCitAdapterOptions) {
    super(opts);
    this.endpointTemplate = opts.endpointTemplate ?? ARBA_DEFAULT_ENDPOINT;
  }

  protected buildLookupRequest(cuit: string) {
    return {
      url: this.endpointTemplate.replace("{cuit}", encodeURIComponent(cuit)),
      method: "GET",
      headers: { accept: "application/json, text/xml, */*" },
    };
  }

  protected parseLookupResponse(text: string, cuit: string): Padron | null {
    // ARBA returns XML for the dfe surface and JSON for the newer REST
    // surface. Try JSON first.
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const estado = String(j["estado"] ?? j["status"] ?? "").toLowerCase();
      const inscripto =
        j["inscripto"] === true ||
        estado === "inscripto" ||
        estado === "active";
      if (
        j["inscripto"] === false ||
        estado === "no_inscripto" ||
        estado === "inactive"
      ) {
        return null;
      }
      if (inscripto) {
        const regimeRaw = String(j["regimen"] ?? "").toUpperCase();
        return {
          cuit,
          jurisdiction: "BSAS",
          inscribed: true,
          regime: regimeRaw === "CM" || regimeRaw === "CONVENIO" ? "cm" : "local",
          inscriptionNumber:
            typeof j["nroInscripcion"] === "string"
              ? j["nroInscripcion"]
              : undefined,
        };
      }
    } catch {
      // XML fallback below.
    }
    // XML heuristic — ARBA dfe wraps results in <inscripto>true</inscripto>
    // or <inscripto>false</inscripto>.
    if (/<inscripto>\s*false\s*<\/inscripto>/i.test(text)) return null;
    if (/<inscripto>\s*true\s*<\/inscripto>/i.test(text)) {
      const regimeMatch = /<regimen>\s*([^<]+)\s*<\/regimen>/i.exec(text);
      const regime =
        regimeMatch && regimeMatch[1]?.toUpperCase().includes("CM")
          ? "cm"
          : "local";
      return {
        cuit,
        jurisdiction: "BSAS",
        inscribed: true,
        regime,
      };
    }
    throw new IibbUnconfiguredError(
      "parseLookupResponse",
      `ARBA response did not match known shapes; subclass + override parseLookupResponse if ARBA changed its surface`,
    );
  }
}

// ── Legacy stubs (kept for backwards compatibility) ─────────────

/**
 * @deprecated since v0.2 — prefer AgipPublicAdapter, which performs a
 * real padrón lookup against AGIP's public endpoint. This stub remains
 * exported so existing callers don't break, but new code should adopt
 * the concrete adapter.
 */
export class AgipAdapter extends StubAdapter {
  readonly jurisdiction: JurisdictionCode = "CABA";

  constructor() {
    super("AGIP (CABA) [DEPRECATED stub — use AgipPublicAdapter]");
  }
}

/**
 * @deprecated since v0.2 — prefer ArbaCitAdapter with a CIT-authenticated
 * fetcher. This stub remains exported so existing callers don't break.
 */
export class ArbaAdapter extends StubAdapter {
  readonly jurisdiction: JurisdictionCode = "BSAS";

  constructor() {
    super("ARBA (Buenos Aires) [DEPRECATED stub — use ArbaCitAdapter]");
  }
}

/**
 * Convenio Multilateral adapter (Comisión Arbitral / SIRCAR).
 *
 * v0.2 still ships only a stub: SIRCAR's API surface is CIT-gated and
 * undocumented enough that we won't bake a default URL into the
 * package. Hosts with Comarb credentials should subclass
 * HttpPadronAdapter directly with their own endpoint + parser.
 */
export class ConvenioMultilateralAdapter extends StubAdapter {
  readonly jurisdiction: JurisdictionCode = "CM";

  constructor() {
    super("Comisión Arbitral (Convenio Multilateral)");
  }
}
