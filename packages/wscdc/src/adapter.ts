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
  HttpClient,
  isArAgentsError,
  ArAgentsProtocolError,
  parseOrThrow,
  type HttpRetryOptions,
} from "@ar-agents/core";
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
import {
  constatarResultSchema,
  dummyResultSchema,
} from "./types";
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

/**
 * @deprecated Kept only so external code that imported this type keeps
 * compiling. The adapter now builds on `@ar-agents/core`'s `HttpClient`,
 * whose `fetch` override is a standard `typeof fetch`. Pass a real
 * `fetch` (`HttpWscdcAdapterOptions.fetch`) instead of this shape.
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

export interface HttpWscdcAdapterOptions {
  env: WscdcEnv;
  /** WSAA access ticket for the `wscdc` service. The caller is
   * responsible for acquiring + refreshing it (use
   * `@ar-agents/identity`'s wsaa helpers or any compatible WSAA
   * client). */
  ticket: AccessTicket;
  /** Optional fetch override (mainly for tests). Defaults to
   * globalThis.fetch. Standard `fetch` shape — the adapter builds on
   * `@ar-agents/core`'s `HttpClient`, which needs a real `Response`. */
  fetch?: typeof fetch;
  /** Override the endpoint URL (test stubs, regional proxies). */
  endpoint?: string;
  /** Per-request timeout in ms. Default 15_000. */
  timeoutMs?: number;
  /** User-Agent identifying the client. */
  userAgent?: string;
  /** Retry policy for transient failures on the (read-only) SOAP calls.
   * Forwarded to `@ar-agents/core`'s `HttpClient`. Both operations are
   * pure reads, so retries are safe. */
  retry?: HttpRetryOptions;
}

const DEFAULT_UA = "@ar-agents/wscdc (https://ar-agents.ar)";

export class HttpWscdcAdapter implements WscdcAdapter {
  private readonly env: WscdcEnv;
  private readonly ticket: AccessTicket;
  private readonly client: HttpClient;
  private readonly soapPath: string;

  constructor(opts: HttpWscdcAdapterOptions) {
    this.env = opts.env;
    this.ticket = opts.ticket;
    const endpoint = opts.endpoint ?? WSCDC_URLS[opts.env];
    const f = opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (!f) {
      throw new WscdcUnconfiguredError(
        "fetch",
        "no fetch function available (pass `fetch` in HttpWscdcAdapterOptions or polyfill globalThis.fetch)",
      );
    }
    // The endpoint is a full `.asmx` URL. Split origin (→ baseUrl) from
    // pathname+query (→ per-request `path`) so `buildUrl` reconstructs the
    // EXACT endpoint (a bare "/" path would resolve to "service.asmx/" and
    // change the URL AFIP dispatches on). HttpClient gives us a real
    // per-request timeout, bounded jittered backoff, and typed error
    // mapping — replacing the old hand-rolled Promise.race timeout that
    // leaked its timer's rejection.
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new WscdcUnconfiguredError(
        "endpoint",
        `invalid endpoint URL: ${JSON.stringify(endpoint)}`,
      );
    }
    this.soapPath = `${parsed.pathname}${parsed.search}`;
    this.client = new HttpClient({
      baseUrl: parsed.origin,
      fetch: f,
      timeoutMs: opts.timeoutMs ?? 15_000,
      userAgent: opts.userAgent ?? DEFAULT_UA,
      defaultHeaders: { "Content-Type": "text/xml; charset=utf-8" },
      ...(opts.retry ? { retry: opts.retry } : {}),
    });
  }

  async validateComprobante(req: ConstatarRequest): Promise<ConstatarResult> {
    validateConstatarRequest(req);
    const body = buildConstatarEnvelope({ ticket: this.ticket, req });
    // ComprobanteConstatar is a pure READ (no state change on AFIP's
    // side), so it is safe to retry a transient 5xx. `idempotent: true`
    // opts this POST into the client's retry policy.
    const text = await this.postSoap(
      body,
      WSCDC_SOAP_ACTIONS.comprobanteConstatar,
    );
    let result: ConstatarResult;
    try {
      result = parseConstatarResponse(text);
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
    // Second boundary: assert the parsed shape so a drifted body fails
    // LOUD instead of a blind-cast result. Throws
    // ArAgentsResponseValidationError (surfaced as-is — never swallowed).
    return parseOrThrow(constatarResultSchema, result, {
      service: "wscdc",
      env: this.env,
    });
  }

  async health() {
    const body = buildDummyEnvelope();
    const text = await this.postSoap(body, WSCDC_SOAP_ACTIONS.dummy);
    let result: { appServer: string; dbServer: string; authServer: string };
    try {
      result = parseDummyResponse(text);
    } catch (err) {
      throw new WscdcProtocolError(
        `WSCDC Dummy response could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return parseOrThrow(dummyResultSchema, result, {
      service: "wscdc",
      env: this.env,
    });
  }

  private async postSoap(body: string, soapAction: string): Promise<string> {
    let res: Response;
    try {
      res = await this.client.requestRaw({
        method: "POST",
        path: this.soapPath,
        headers: {
          soapaction: `"${soapAction}"`,
        },
        body,
        accept: "text/xml",
        // Constatar/Dummy are reads — safe to retry a transient 5xx.
        idempotent: true,
      });
    } catch (err) {
      throw this.toProtocolError(err);
    }
    return res.text();
  }

  /**
   * Map a typed `@ar-agents/core` transport error back onto
   * `WscdcProtocolError`, preserving the AFIP `faultstring` when the body
   * carried one. AFIP returns HTTP 500 with a `<soap:Fault>` body on TA
   * expiry, so the fault message lives in the error's `context.body`.
   */
  private toProtocolError(err: unknown): WscdcProtocolError {
    if (isArAgentsError(err)) {
      const status =
        err instanceof ArAgentsProtocolError ? err.status : null;
      const rawBody = err.context?.["body"];
      const bodyStr = typeof rawBody === "string" ? rawBody : "";
      const fault =
        /<faultstring>([\s\S]*?)<\/faultstring>/i.exec(bodyStr)?.[1];
      if (status === null) {
        // Network / timeout (ArAgentsProtocolError with status null).
        return new WscdcProtocolError(
          `WSCDC (${this.env}) HTTP error: ${err.message}`,
        );
      }
      return new WscdcProtocolError(
        `WSCDC (${this.env}) returned HTTP ${status}${fault ? `: ${fault.trim()}` : ""}`,
        { status },
      );
    }
    return new WscdcProtocolError(
      `WSCDC (${this.env}) HTTP error: ${err instanceof Error ? err.message : String(err)}`,
    );
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
