/**
 * WSFECred adapter contract.
 *
 * v0.1 ships:
 *   UnconfiguredFecredAdapter  throws on every operation. Default.
 *   InMemoryFecredAdapter      deterministic in-process implementation.
 *                              Pre-seed received FCEs; accept/reject
 *                              mutate the in-memory state. Use for
 *                              tests + demos without AFIP creds.
 *   HttpFecredAdapter          real-network adapter. Caller supplies a
 *                              WSAA AccessTicket (service "wsfecred")
 *                              + AFIP env.
 */
import {
  buildAceptarEnvelope,
  buildConsultarComprobantesEnvelope,
  buildConsultarMontoObligadoEnvelope,
  buildDummyEnvelope,
  buildRechazarEnvelope,
  parseConsultarComprobantesResponse,
  parseConsultarMontoObligadoResponse,
  parseDummyResponse,
  parseOperacionFECredResponse,
  SoapFaultError,
  FECRED_URLS,
  FECRED_SOAP_ACTIONS,
} from "./soap";
import {
  FecredProtocolError,
  FecredUnconfiguredError,
  FecredValidationError,
} from "./errors";
import {
  HttpClient,
  ArAgentsAuthError,
  ArAgentsProtocolError,
  ArAgentsRateLimitError,
  isArAgentsError,
} from "@ar-agents/core";
import {
  acceptInvoiceInputSchema,
  checkObligationInputSchema,
  listComprobantesInputSchema,
  rejectInvoiceInputSchema,
} from "./types";
import type {
  AccessTicket,
  AcceptInvoiceInput,
  CheckObligationInput,
  CheckObligationResult,
  FecredComprobante,
  FecredEnv,
  FecredHealth,
  ListComprobantesInput,
  ListComprobantesResult,
  OperacionFECredResult,
  RejectInvoiceInput,
} from "./types";
import { z } from "zod";

export interface FecredAdapter {
  /** Is the consulted CUIT obligated to receive FCE, and from what
   * amount? Pure read. */
  checkObligation(input: CheckObligationInput): Promise<CheckObligationResult>;
  /** List emitted/received FCE comprobantes by filter. Pure read. */
  listComprobantes(input: ListComprobantesInput): Promise<ListComprobantesResult>;
  /** Accept an FCE's cta. cte. IRREVERSIBLE on AFIP's side. */
  acceptInvoice(input: AcceptInvoiceInput): Promise<OperacionFECredResult>;
  /** Reject an FCE's cta. cte. IRREVERSIBLE on AFIP's side. */
  rejectInvoice(input: RejectInvoiceInput): Promise<OperacionFECredResult>;
  /** Service health (AFIP's dummy). */
  health(): Promise<FecredHealth>;
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = (schema as z.ZodTypeAny).safeParse(value);
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue?.path.join(".") || "input";
    throw new FecredValidationError(field, issue?.message ?? "invalid input");
  }
  return r.data as T;
}

export class UnconfiguredFecredAdapter implements FecredAdapter {
  async checkObligation(): Promise<never> {
    throw new FecredUnconfiguredError("checkObligation");
  }
  async listComprobantes(): Promise<never> {
    throw new FecredUnconfiguredError("listComprobantes");
  }
  async acceptInvoice(): Promise<never> {
    throw new FecredUnconfiguredError("acceptInvoice");
  }
  async rejectInvoice(): Promise<never> {
    throw new FecredUnconfiguredError("rejectInvoice");
  }
  async health(): Promise<never> {
    throw new FecredUnconfiguredError("health");
  }
}

// ── HTTP (real AFIP) ────────────────────────────────────────────

/**
 * @deprecated The adapter now builds on `@ar-agents/core`'s `HttpClient`,
 * which uses the standard `fetch` shape. Pass `fetch?: typeof fetch`
 * instead. This alias is kept exported (as `typeof fetch`) so external
 * type imports don't break; it no longer describes the custom minimal
 * shape the old raw-fetch transport accepted.
 */
export type FetchLike = typeof fetch;

export interface HttpFecredAdapterOptions {
  env: FecredEnv;
  /** WSAA access ticket for the `wsfecred` service. The caller is
   * responsible for acquiring + refreshing it (use
   * `@ar-agents/identity`'s wsaa helpers or any compatible WSAA
   * client). */
  ticket: AccessTicket;
  /** Optional fetch override (mainly for tests). Defaults to
   * globalThis.fetch. */
  fetch?: typeof fetch;
  /** Override the endpoint URL (test stubs, regional proxies). */
  endpoint?: string;
  /** Per-request timeout in ms. Default 15_000. */
  timeoutMs?: number;
  /** User-Agent identifying the client. */
  userAgent?: string;
}

const DEFAULT_UA = "@ar-agents/fecred (https://ar-agents.ar)";

export class HttpFecredAdapter implements FecredAdapter {
  private readonly env: FecredEnv;
  private readonly ticket: AccessTicket;
  private readonly endpoint: string;
  private readonly client: HttpClient;
  /** Path segment of the endpoint, passed to `client.request({ path })`.
   * Splitting origin (baseUrl) from pathname keeps the resolved URL byte
   * -identical to the original endpoint (no injected trailing slash). */
  private readonly path: string;
  private readonly userAgent: string;

  constructor(opts: HttpFecredAdapterOptions) {
    this.env = opts.env;
    this.ticket = opts.ticket;
    this.endpoint = opts.endpoint ?? FECRED_URLS[opts.env];
    this.userAgent = opts.userAgent ?? DEFAULT_UA;

    const f =
      opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (!f) {
      throw new FecredUnconfiguredError(
        "fetch",
        "no fetch function available (pass `fetch` in HttpFecredAdapterOptions or polyfill globalThis.fetch)",
      );
    }

    // The endpoint is a FULL URL per env. Split it into origin + path so the
    // core client's baseUrl-relative resolution reproduces the exact URL.
    let baseUrl: string;
    let path: string;
    try {
      const u = new URL(this.endpoint);
      baseUrl = u.origin;
      // Preserve pathname + any query/hash verbatim.
      path = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      throw new FecredUnconfiguredError(
        "endpoint",
        `invalid WSFECred endpoint URL: ${this.endpoint}`,
      );
    }
    this.path = path;

    this.client = new HttpClient({
      baseUrl,
      fetch: f,
      timeoutMs: opts.timeoutMs ?? 15_000,
      userAgent: this.userAgent,
    });
  }

  async checkObligation(input: CheckObligationInput): Promise<CheckObligationResult> {
    const i = parseOrThrow(checkObligationInputSchema, input);
    const body = buildConsultarMontoObligadoEnvelope({
      ticket: this.ticket,
      cuitConsultada: i.cuitConsultada,
      fechaEmision: i.fechaEmision ?? new Date().toISOString().slice(0, 10),
    });
    const text = await this.postSoap(
      body,
      FECRED_SOAP_ACTIONS.consultarMontoObligadoRecepcion,
    );
    return this.parse(() => parseConsultarMontoObligadoResponse(text));
  }

  async listComprobantes(input: ListComprobantesInput): Promise<ListComprobantesResult> {
    const i = parseOrThrow(listComprobantesInputSchema, input);
    const body = buildConsultarComprobantesEnvelope({
      ticket: this.ticket,
      input: i,
    });
    const text = await this.postSoap(
      body,
      FECRED_SOAP_ACTIONS.consultarComprobantes,
    );
    return this.parse(() => parseConsultarComprobantesResponse(text));
  }

  async acceptInvoice(input: AcceptInvoiceInput): Promise<OperacionFECredResult> {
    const i = parseOrThrow(acceptInvoiceInputSchema, input);
    const body = buildAceptarEnvelope({ ticket: this.ticket, input: i });
    const text = await this.postSoap(body, FECRED_SOAP_ACTIONS.aceptarFECred);
    return this.parse(() => parseOperacionFECredResponse(text));
  }

  async rejectInvoice(input: RejectInvoiceInput): Promise<OperacionFECredResult> {
    const i = parseOrThrow(rejectInvoiceInputSchema, input);
    const body = buildRechazarEnvelope({ ticket: this.ticket, input: i });
    const text = await this.postSoap(body, FECRED_SOAP_ACTIONS.rechazarFECred);
    return this.parse(() => parseOperacionFECredResponse(text));
  }

  async health(): Promise<FecredHealth> {
    const body = buildDummyEnvelope();
    const text = await this.postSoap(body, FECRED_SOAP_ACTIONS.dummy);
    return this.parse(() => parseDummyResponse(text));
  }

  private parse<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      if (err instanceof SoapFaultError) {
        throw new FecredProtocolError(`WSFECred SOAP fault: ${err.message}`, {
          faultCode: err.faultCode,
        });
      }
      throw new FecredProtocolError(
        `WSFECred response could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async postSoap(body: string, soapAction: string): Promise<string> {
    // SOAP is text/xml — use requestRaw and decode the body ourselves. The
    // core client still runs timeout + typed-error mapping; it throws on
    // status >= 400 BEFORE we can read the body, so we recover AFIP's
    // <faultstring> (when present) from the error's body snippet.
    //
    // IDEMPOTENCY: every FECred operation is a POST (reads + the irreversible
    // aceptar/rechazar money acts alike) and none carries an idempotency key.
    // We pass `retry: false` to disable auto-retry ENTIRELY — not just leaving
    // `idempotent` unset. That closes the one hole in the default classifier
    // where a 429 is retried regardless of method: an irreversible accept /
    // reject must never be replayed on a transient 429/5xx.
    let res: Response;
    try {
      res = await this.client.requestRaw({
        method: "POST",
        path: this.path,
        headers: {
          "content-type": "text/xml; charset=utf-8",
          soapaction: `"${soapAction}"`,
        },
        body,
        accept: "text/xml",
        retry: false,
      });
    } catch (err) {
      throw this.mapTransportError(err);
    }
    return res.text();
  }

  /** Map a thrown `@ar-agents/core` transport error to the FECred taxonomy,
   * preserving the HTTP-status-with-faultstring behaviour of the old
   * transport (status + AFIP <faultstring>), and routing network/timeout
   * (status === null) to the network-error path. */
  private mapTransportError(err: unknown): FecredProtocolError {
    if (!isArAgentsError(err)) {
      return new FecredProtocolError(
        `WSFECred (${this.env}) HTTP error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    // Auth failures (401/403) and rate limits (429) are HTTP-status errors:
    // surface them with their status + any faultstring, same shape as the
    // generic protocol case (FECred has a single protocol-error class).
    let status: number | null = null;
    let bodySnippet: unknown;
    if (err instanceof ArAgentsAuthError) {
      status = (err.context?.["status"] as number | undefined) ?? null;
      bodySnippet = err.context?.["body"];
    } else if (err instanceof ArAgentsRateLimitError) {
      status = 429;
      bodySnippet = err.context?.["body"];
    } else if (err instanceof ArAgentsProtocolError) {
      status = err.status;
      bodySnippet = err.context?.["body"];
    }

    // status === null ⇒ network/timeout: no HTTP status to report.
    if (status === null) {
      return new FecredProtocolError(
        `WSFECred (${this.env}) HTTP error: ${err.message}`,
      );
    }

    const fault =
      typeof bodySnippet === "string"
        ? /<faultstring>([\s\S]*?)<\/faultstring>/i.exec(bodySnippet)?.[1]
        : undefined;
    return new FecredProtocolError(
      `WSFECred (${this.env}) returned HTTP ${status}${
        fault ? `: ${fault.trim()}` : ""
      }`,
      { status },
    );
  }
}

// ── In-memory (testing / dogfood) ───────────────────────────────

export interface InMemoryFecredOptions {
  /** Seeded received comprobantes (estado is honored + mutated by
   * accept/reject). */
  comprobantes?: ReadonlyArray<FecredComprobante>;
  /** CUITs that checkObligation reports as obligated. */
  obligatedCuits?: ReadonlyArray<string>;
  /** Threshold amount returned for obligated CUITs. The real value
   * comes from AFIP and changes over time; configure per test. */
  montoDesde?: number;
}

/**
 * Deterministic in-memory adapter. checkObligation answers from a
 * configured CUIT set; listComprobantes filters the seeded list;
 * accept/reject flip the seeded comprobante's estado and return "A".
 * NOT a load test surface. Intended for vitest + demo flows without
 * AFIP creds.
 */
export class InMemoryFecredAdapter implements FecredAdapter {
  private readonly comprobantes: FecredComprobante[];
  private readonly obligatedCuits: Set<string>;
  private readonly montoDesde: number;

  constructor(opts: InMemoryFecredOptions = {}) {
    this.comprobantes = [...(opts.comprobantes ?? [])];
    this.obligatedCuits = new Set(
      (opts.obligatedCuits ?? []).map((c) => c.replace(/-/g, "")),
    );
    this.montoDesde = opts.montoDesde ?? 5_500_000;
  }

  async checkObligation(input: CheckObligationInput): Promise<CheckObligationResult> {
    const i = parseOrThrow(checkObligationInputSchema, input);
    const obligado = this.obligatedCuits.has(i.cuitConsultada.replace(/-/g, ""));
    return {
      obligado,
      montoDesde: obligado ? this.montoDesde : null,
      observaciones: [],
      errors: [],
    };
  }

  async listComprobantes(input: ListComprobantesInput): Promise<ListComprobantesResult> {
    const i = parseOrThrow(listComprobantesInputSchema, input);
    const cuitContraparte = i.cuitContraparte?.replace(/-/g, "");
    const out = this.comprobantes.filter((c) => {
      if (i.estadoCmp && c.estado !== i.estadoCmp) return false;
      if (i.codTipoCmp !== undefined && c.codTipoCmp !== i.codTipoCmp) return false;
      if (cuitContraparte) {
        const other = i.rol === "Receptor" ? c.cuitEmisor : c.cuitReceptor;
        if (other.replace(/-/g, "") !== cuitContraparte) return false;
      }
      return true;
    });
    return {
      comprobantes: out,
      nroPagina: 1,
      hayMas: false,
      observaciones: [],
      errors: [],
    };
  }

  async acceptInvoice(input: AcceptInvoiceInput): Promise<OperacionFECredResult> {
    const i = parseOrThrow(acceptInvoiceInputSchema, input);
    return this.transition(i.idFactura, "Aceptado");
  }

  async rejectInvoice(input: RejectInvoiceInput): Promise<OperacionFECredResult> {
    const i = parseOrThrow(rejectInvoiceInputSchema, input);
    return this.transition(i.idFactura, "Rechazado");
  }

  private transition(
    id: { cuitEmisor: string; codTipoCmp: number; ptoVta: number; nroCmp: number },
    estado: "Aceptado" | "Rechazado",
  ): OperacionFECredResult {
    const match = this.comprobantes.find(
      (c) =>
        c.cuitEmisor.replace(/-/g, "") === id.cuitEmisor.replace(/-/g, "") &&
        c.codTipoCmp === id.codTipoCmp &&
        c.ptoVta === id.ptoVta &&
        c.nroCmp === id.nroCmp,
    );
    if (!match) {
      return {
        resultado: "R",
        codCtaCte: null,
        observaciones: [],
        errors: [
          {
            code: 1100,
            msg: "No existe la factura indicada (synthetic, InMemory adapter).",
          },
        ],
      };
    }
    if (match.estado === "Aceptado" || match.estado === "Rechazado") {
      return {
        resultado: "R",
        codCtaCte: match.codCtaCte,
        observaciones: [],
        errors: [
          {
            code: 1101,
            msg: `La factura ya se encuentra en estado ${match.estado} (synthetic, InMemory adapter).`,
          },
        ],
      };
    }
    match.estado = estado;
    return {
      resultado: "A",
      codCtaCte: match.codCtaCte,
      observaciones: [],
      errors: [],
    };
  }

  async health(): Promise<FecredHealth> {
    return { appServer: "OK", dbServer: "OK", authServer: "OK" };
  }
}
