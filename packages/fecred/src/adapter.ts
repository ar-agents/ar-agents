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

export interface HttpFecredAdapterOptions {
  env: FecredEnv;
  /** WSAA access ticket for the `wsfecred` service. The caller is
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

const DEFAULT_UA = "@ar-agents/fecred (https://ar-agents.ar)";

export class HttpFecredAdapter implements FecredAdapter {
  private readonly env: FecredEnv;
  private readonly ticket: AccessTicket;
  private readonly endpoint: string;
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(opts: HttpFecredAdapterOptions) {
    this.env = opts.env;
    this.ticket = opts.ticket;
    this.endpoint = opts.endpoint ?? FECRED_URLS[opts.env];
    const f = opts.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!f) {
      throw new FecredUnconfiguredError(
        "fetch",
        "no fetch function available (pass `fetch` in HttpFecredAdapterOptions or polyfill globalThis.fetch)",
      );
    }
    this.fetcher = f;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
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
      throw new FecredProtocolError(
        `WSFECred (${this.env}) HTTP error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      const fault = /<faultstring>([\s\S]*?)<\/faultstring>/i.exec(text)?.[1];
      throw new FecredProtocolError(
        `WSFECred (${this.env}) returned HTTP ${res.status}${fault ? `: ${fault.trim()}` : ""}`,
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
