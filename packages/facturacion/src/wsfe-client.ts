/**
 * High-level WSFE client. Combines the WSAA token-cache (from
 * `@ar-agents/identity/wsaa`) with the WSFE operations from `wsfe.ts`.
 *
 * Most apps interact only with this class — call its methods, get back
 * normalized result types, never touch SOAP envelopes.
 *
 * # Setup
 *
 * 1. Generate cert + register alias as documented in the
 *    `@ar-agents/identity` README.
 * 2. In ARCA → "Administrador de Relaciones de Clave Fiscal", authorize the
 *    alias for service `wsfe` (Servicio Web de Facturación Electrónica).
 * 3. Construct the client:
 *
 *    ```ts
 *    import { WsfeClient } from "@ar-agents/facturacion";
 *
 *    const wsfe = new WsfeClient({
 *      certPath: process.env.AFIP_CERT_PATH!,
 *      keyPath: process.env.AFIP_KEY_PATH!,
 *      cuit: process.env.AFIP_CUIT!,
 *      env: "prod",
 *    });
 *    ```
 *
 * The same cert that powers `@ar-agents/identity` works here — you just need
 * to authorize the `wsfe` service in addition to whatever padron service
 * you're using.
 */

import {
  TokenCache,
  type TokenStore,
} from "@ar-agents/identity/wsaa";
import { normalizeCuit } from "@ar-agents/identity";
import {
  consultarComprobante,
  consultarUltimoAutorizado,
  dummy,
  getCotizacion,
  getTiposCbte,
  getTiposConcepto,
  getTiposDoc,
  getTiposIva,
  getTiposMonedas,
  solicitarCAE,
  WSFE_SERVICE_NAME,
} from "./wsfe";
import type {
  ConsultarComprobanteResult,
  DummyResult,
  SolicitarCaeInput,
  SolicitarCaeResult,
  UltimoComprobanteResult,
  WsfeEnv,
} from "./types";
import type { CbteTipoCode } from "./catalogs";
import { WsfeNotConfiguredError } from "./errors";

export interface WsfeClientOptions {
  /** X.509 cert PEM file path. Mutually exclusive with `certPem`. */
  certPath?: string;
  /** RSA private key PEM file path. Mutually exclusive with `keyPem`. */
  keyPath?: string;
  /** X.509 cert as a PEM string (for serverless: read from env var). */
  certPem?: string;
  /** RSA private key as a PEM string. */
  keyPem?: string;
  /**
   * The CUIT whose Clave Fiscal authorized the certificate. Goes in every
   * request as `Cuit` and is the issuer of all comprobantes emitted.
   */
  cuit: string;
  /** "homo" for sandbox; "prod" for live. */
  env: WsfeEnv;
  /** Override TA storage for multi-process setups (Redis, DB, etc.). */
  tokenStore?: TokenStore;
  /** Override WSAA URL (testing only). */
  wsaaEndpoint?: string;
  /** Override WSFE URL (testing only). */
  wsfeEndpoint?: string;
  /** Custom fetch (testing). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 30s. */
  requestTimeoutMs?: number;
  /** Retries on 5xx + transient errors. Default 1. */
  maxRetries?: number;
  /**
   * Observability hook fired after every WSAA + WSFE request.
   */
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}

interface CommonOps {
  ta: import("@ar-agents/identity/wsaa").AccessTicket;
  env: WsfeEnv;
  cuit: string;
  endpointOverride?: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  maxRetries?: number;
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}

export class WsfeClient {
  private readonly cache: TokenCache;
  private readonly cuit: string;
  private readonly env: WsfeEnv;
  private readonly wsfeEndpoint: string | undefined;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly requestTimeoutMs: number | undefined;
  private readonly maxRetries: number | undefined;
  private readonly onCall: WsfeClientOptions["onCall"];

  constructor(options: WsfeClientOptions) {
    const hasPaths = options.certPath && options.keyPath;
    const hasPems = options.certPem && options.keyPem;
    if ((!hasPaths && !hasPems) || !options.cuit) {
      throw new WsfeNotConfiguredError();
    }

    this.cache = new TokenCache({
      env: options.env,
      ...(options.certPath !== undefined ? { certPath: options.certPath } : {}),
      ...(options.keyPath !== undefined ? { keyPath: options.keyPath } : {}),
      ...(options.certPem !== undefined ? { certPem: options.certPem } : {}),
      ...(options.keyPem !== undefined ? { keyPem: options.keyPem } : {}),
      ...(options.tokenStore !== undefined ? { store: options.tokenStore } : {}),
      ...(options.wsaaEndpoint !== undefined
        ? { endpointOverride: options.wsaaEndpoint }
        : {}),
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.requestTimeoutMs !== undefined
        ? { requestTimeoutMs: options.requestTimeoutMs }
        : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.onCall !== undefined ? { onCall: options.onCall } : {}),
    });
    this.cuit = normalizeCuit(options.cuit);
    this.env = options.env;
    this.wsfeEndpoint = options.wsfeEndpoint;
    this.fetchImpl = options.fetchImpl;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.maxRetries = options.maxRetries;
    this.onCall = options.onCall;
  }

  private async commonOps(): Promise<CommonOps> {
    const ta = await this.cache.getTicket(WSFE_SERVICE_NAME);
    const ops: CommonOps = {
      ta,
      env: this.env,
      cuit: this.cuit,
    };
    if (this.wsfeEndpoint !== undefined) ops.endpointOverride = this.wsfeEndpoint;
    if (this.fetchImpl !== undefined) ops.fetchImpl = this.fetchImpl;
    if (this.requestTimeoutMs !== undefined)
      ops.requestTimeoutMs = this.requestTimeoutMs;
    if (this.maxRetries !== undefined) ops.maxRetries = this.maxRetries;
    if (this.onCall !== undefined) ops.onCall = this.onCall;
    return ops;
  }

  /** AFIP WSFE health check. Returns `{ appServer, dbServer, authServer }`. */
  async dummy(): Promise<DummyResult> {
    return dummy(await this.commonOps());
  }

  /**
   * Get the last authorized comprobante number for a (PtoVta, CbteTipo) pair.
   * Use `result.cbteNro + 1` as the next emission's `cbteDesde`.
   */
  async consultarUltimoAutorizado(
    ptoVta: number,
    cbteTipo: CbteTipoCode,
  ): Promise<UltimoComprobanteResult> {
    const ops = await this.commonOps();
    return consultarUltimoAutorizado({ ...ops, ptoVta, cbteTipo });
  }

  /** Look up a previously-authorized comprobante by its number. */
  async consultarComprobante(
    ptoVta: number,
    cbteTipo: CbteTipoCode,
    cbteNro: number,
  ): Promise<ConsultarComprobanteResult> {
    const ops = await this.commonOps();
    return consultarComprobante({ ...ops, ptoVta, cbteTipo, cbteNro });
  }

  /**
   * Solicit a CAE (Código de Autorización Electrónico) for a single
   * comprobante. The PRIMARY emission method.
   */
  async solicitarCAE(input: SolicitarCaeInput): Promise<SolicitarCaeResult> {
    const ops = await this.commonOps();
    return solicitarCAE({ ...ops, ...input });
  }

  /** Live AFIP catalog of comprobante types. */
  async getTiposCbte() {
    return getTiposCbte(await this.commonOps());
  }

  /** Live AFIP catalog of document types. */
  async getTiposDoc() {
    return getTiposDoc(await this.commonOps());
  }

  /** Live AFIP catalog of IVA rates. */
  async getTiposIva() {
    return getTiposIva(await this.commonOps());
  }

  /** Live AFIP catalog of conceptos. */
  async getTiposConcepto() {
    return getTiposConcepto(await this.commonOps());
  }

  /** Live AFIP catalog of currencies. */
  async getTiposMonedas() {
    return getTiposMonedas(await this.commonOps());
  }

  /** Get the AFIP-published exchange rate for a foreign currency vs ARS. */
  async getCotizacion(monId: string) {
    const ops = await this.commonOps();
    return getCotizacion({ ...ops, monId });
  }
}
