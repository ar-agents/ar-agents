/**
 * WSCDC adapter contract.
 *
 * v0.1 ships:
 *   UnconfiguredWscdcAdapter  throws on every operation. Default. Safe
 *                             for unit tests that exercise only the
 *                             input validation primitives.
 *   InMemoryWscdcAdapter      deterministic in-process implementation.
 *                             Pre-seed expected (CAE, emisor, total)
 *                             triples; everything else returns "N".
 *                             Use for integration tests + cockpit
 *                             dogfood without AFIP creds.
 *   HttpWscdcAdapter          real-network adapter. Caller supplies a
 *                             WSAA AccessTicket + AFIP env. Validates
 *                             the input locally, builds the SOAP
 *                             envelope, POSTs to AFIP, parses.
 */
import {
  buildConstatarEnvelope,
  buildDummyEnvelope,
  parseConstatarResponse,
  parseDummyResponse,
  SoapFaultError,
  WSCDC_URLS,
  WSCDC_SOAP_ACTIONS,
} from "./soap";
import { validateConstatarRequest } from "./validate";
import {
  WscdcProtocolError,
  WscdcUnconfiguredError,
} from "./errors";
import type {
  AccessTicket,
  ConstatarRequest,
  ConstatarResult,
  WscdcEnv,
} from "./types";

export interface WscdcAdapter {
  /** Validate a comprobante's authenticity against AFIP. */
  validateComprobante(req: ConstatarRequest): Promise<ConstatarResult>;
  /** Service health (AFIP's Dummy). Returns AppServer/DbServer/AuthServer status. */
  health(): Promise<{
    appServer: string;
    dbServer: string;
    authServer: string;
  }>;
}

export class UnconfiguredWscdcAdapter implements WscdcAdapter {
  async validateComprobante(): Promise<never> {
    throw new WscdcUnconfiguredError("validateComprobante");
  }
  async health(): Promise<never> {
    throw new WscdcUnconfiguredError("health");
  }
}

// ── HTTP (real AFIP) ────────────────────────────────────────────

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

export interface HttpWscdcAdapterOptions {
  env: WscdcEnv;
  /** WSAA access ticket for the `wscdc` service. The caller is
   * responsible for acquiring + refreshing it (use
   * `@ar-agents/identity`'s wsaa helpers or any compatible WSAA
   * client). */
  ticket: AccessTicket;
  /** Optional fetch override (mainly for tests). Defaults to
   * globalThis.fetch. */
  fetch?: FetchLike;
  /** Override the endpoint URL (test stubs, regional proxies). */
  endpoint?: string;
  /** Per-request timeout in ms. Default 15_000. */
  timeoutMs?: number;
  /** User-Agent identifying the client. */
  userAgent?: string;
}

const DEFAULT_UA = "@ar-agents/wscdc (https://ar-agents.ar)";

export class HttpWscdcAdapter implements WscdcAdapter {
  private readonly env: WscdcEnv;
  private readonly ticket: AccessTicket;
  private readonly endpoint: string;
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(opts: HttpWscdcAdapterOptions) {
    this.env = opts.env;
    this.ticket = opts.ticket;
    this.endpoint = opts.endpoint ?? WSCDC_URLS[opts.env];
    const f = opts.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!f) {
      throw new WscdcUnconfiguredError(
        "fetch",
        "no fetch function available (pass `fetch` in HttpWscdcAdapterOptions or polyfill globalThis.fetch)",
      );
    }
    this.fetcher = f;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
  }

  async validateComprobante(req: ConstatarRequest): Promise<ConstatarResult> {
    validateConstatarRequest(req);
    const body = buildConstatarEnvelope({ ticket: this.ticket, req });
    const text = await this.postSoap(
      body,
      WSCDC_SOAP_ACTIONS.comprobanteConstatar,
    );
    try {
      return parseConstatarResponse(text);
    } catch (err) {
      if (err instanceof SoapFaultError) {
        throw new WscdcProtocolError(
          `WSCDC SOAP fault: ${err.message}`,
          { faultCode: err.faultCode },
        );
      }
      throw new WscdcProtocolError(
        `WSCDC response could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async health() {
    const body = buildDummyEnvelope();
    const text = await this.postSoap(body, WSCDC_SOAP_ACTIONS.dummy);
    try {
      return parseDummyResponse(text);
    } catch (err) {
      throw new WscdcProtocolError(
        `WSCDC Dummy response could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async postSoap(body: string, soapAction: string): Promise<string> {
    let res;
    try {
      res = await this.withTimeout(
        this.fetcher(this.endpoint, {
          method: "POST",
          headers: {
            "content-type": "text/xml; charset=utf-8",
            "user-agent": this.userAgent,
            soapaction: `"${soapAction}"`,
          },
          body,
        }),
      );
    } catch (err) {
      throw new WscdcProtocolError(
        `WSCDC (${this.env}) HTTP error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      // AFIP often returns 500 with a SOAP fault on TA expiry —
      // try to parse the body so the protocol-error message is useful.
      const fault = /<faultstring>([\s\S]*?)<\/faultstring>/i.exec(text)?.[1];
      throw new WscdcProtocolError(
        `WSCDC (${this.env}) returned HTTP ${res.status}${fault ? `: ${fault.trim()}` : ""}`,
        { status: res.status },
      );
    }
    return text;
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

// ── In-memory (testing / dogfood) ───────────────────────────────

export interface InMemoryWscdcSeed {
  /** CUIT of the emisor that issued the comprobante. */
  cuitEmisor: string;
  /** Punto de venta. */
  ptoVta: number;
  /** Comprobante type code. */
  cbteTipo: number;
  /** Comprobante number. */
  cbteNro: number;
  /** Total amount that AFIP has on record. */
  impTotal: number;
  /** CAE / CAEA that AFIP has on record. */
  codAutorizacion: string;
  /** Optional: soft observations to attach when the request matches. */
  observaciones?: ReadonlyArray<{ code: number; msg: string }>;
}

/**
 * Deterministic in-memory adapter. Returns "A" (approved) only when
 * the request matches a seeded entry exactly on cuitEmisor + ptoVta +
 * cbteTipo + cbteNro + impTotal + codAutorizacion. Anything else
 * returns "N" with a synthesised observation describing the first
 * field that didn't match.
 *
 * NOT a load test surface — single-threaded, no concurrency. Intended
 * for vitest + cockpit demo flows without AFIP creds.
 */
export class InMemoryWscdcAdapter implements WscdcAdapter {
  private readonly seeds: ReadonlyArray<InMemoryWscdcSeed>;

  constructor(seeds: ReadonlyArray<InMemoryWscdcSeed> = []) {
    this.seeds = seeds;
  }

  async validateComprobante(req: ConstatarRequest): Promise<ConstatarResult> {
    validateConstatarRequest(req);
    const cuitEmisorClean = req.cuitEmisor.replace(/-/g, "");
    const match = this.seeds.find(
      (s) =>
        s.cuitEmisor.replace(/-/g, "") === cuitEmisorClean &&
        s.ptoVta === req.ptoVta &&
        s.cbteTipo === req.cbteTipo &&
        s.cbteNro === req.cbteNro &&
        s.codAutorizacion === req.codAutorizacion,
    );
    if (!match) {
      return {
        resultado: "N",
        observaciones: [],
        errors: [
          {
            code: 102,
            msg: "El comprobante no se encuentra registrado en AFIP (synthetic, InMemory adapter).",
          },
        ],
        fchProceso: new Date()
          .toISOString()
          .replace(/[-:T.]/g, "")
          .slice(0, 14),
      };
    }
    // Total mismatch: AFIP returns "O" with observation (typical real
    // behavior — total is a soft check unless very far off).
    if (Math.abs(match.impTotal - req.impTotal) > 0.01) {
      return {
        resultado: "O",
        observaciones: [
          {
            code: 102,
            msg: `Total declarado (${req.impTotal.toFixed(2)}) difiere del registrado en AFIP (${match.impTotal.toFixed(2)}).`,
          },
        ],
        errors: [],
        fchProceso: new Date()
          .toISOString()
          .replace(/[-:T.]/g, "")
          .slice(0, 14),
      };
    }
    return {
      resultado: "A",
      observaciones: match.observaciones ?? [],
      errors: [],
      fchProceso: new Date()
        .toISOString()
        .replace(/[-:T.]/g, "")
        .slice(0, 14),
    };
  }

  async health() {
    return {
      appServer: "OK",
      dbServer: "OK",
      authServer: "OK",
    };
  }
}
