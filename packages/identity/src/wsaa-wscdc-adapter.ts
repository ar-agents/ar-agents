import type { AfipPadronAdapter } from "./afip";
import { AfipNotConfiguredError } from "./errors";
import type { AfipPadronResult } from "./types";
import {
  TokenCache,
  type AfipEnv,
  type TokenStore,
} from "./wsaa";
import {
  getPersona,
  CONSTANCIA_INSCRIPCION_SERVICE_NAME,
  type AfipPadronService,
} from "./wscdc";
import { normalizeCuit } from "./cuit";

/**
 * Production-ready `AfipPadronAdapter` that performs real WSAA + WSCDC calls
 * against AFIP's webservices using the integration's X.509 certificate.
 *
 * # Setup checklist (read this once)
 *
 * 1. Generate keypair + CSR locally:
 *    ```
 *    openssl genrsa -out afip-key.pem 2048
 *    openssl req -new -key afip-key.pem \
 *      -subj "/C=AR/O=YourOrg/CN=ar-agents/serialNumber=CUIT YYYYYYYYYY" \
 *      -out afip.csr
 *    ```
 * 2. Login to AFIP with Clave Fiscal at https://auth.afip.gob.ar/, find
 *    "Administración de Certificados Digitales", "Agregar Alias", upload
 *    the `.csr`. Download the `afip-cert.pem` AFIP issues.
 * 3. In "Administrador de Relaciones de Clave Fiscal", create a new relation
 *    authorizing the alias to use the chosen service:
 *    - **Default & recommended**: `ws_sr_constancia_inscripcion` — full
 *      constancia (datos generales + monotributo + IVA condition).
 *    - **Lighter alternative**: `ws_sr_padron_a13` — datos generales only,
 *      no monotributo or IVA. Use if you don't need fiscal condition data.
 * 4. Wire the adapter:
 *    ```ts
 *    import { identityTools } from "@ar-agents/identity";
 *    import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
 *
 *    const afip = new WsaaWscdcAfipPadronAdapter({
 *      certPath: process.env.AFIP_CERT_PATH!,
 *      keyPath: process.env.AFIP_KEY_PATH!,
 *      cuitRepresentado: process.env.AFIP_CUIT!,
 *      env: "prod",
 *      // service: "ws_sr_constancia_inscripcion" (default)
 *    });
 *    const tools = identityTools({ afip });
 *    ```
 *
 * # Caching
 *
 * The adapter holds an in-memory TA cache keyed by service. For multi-process
 * deployments (Vercel functions, Lambda), pass a custom `TokenStore` that
 * persists to Upstash Redis or your DB.
 *
 * # Error model
 *
 * - Setup errors (cert missing, env var missing) → throw at construction.
 * - WSAA errors (cert invalid, service not authorized) → returned as
 *   `{ available: false, error: "..." }` with a clear message.
 * - WSCDC errors (CUIT not found, service down) → same.
 * - Unexpected errors → re-thrown for the caller to handle.
 */
export interface WsaaWscdcAdapterOptions {
  /**
   * Absolute path to the X.509 certificate PEM (the file AFIP issued).
   * Mutually exclusive with `certPem`. Use this for local dev.
   */
  certPath?: string;
  /** Absolute path to the matching RSA private key PEM. */
  keyPath?: string;
  /**
   * The X.509 certificate as a PEM string. Use this for serverless runtimes
   * (Vercel, Lambda) where there's no persistent filesystem — paste the PEM
   * into an env var, then `certPem: process.env.AFIP_CERT_PEM`.
   */
  certPem?: string;
  /** The matching RSA private key as a PEM string. See `certPem`. */
  keyPem?: string;
  /**
   * The CUIT whose Clave Fiscal authorized the certificate. AFIP requires
   * this in every call as `cuitRepresentada`.
   */
  cuitRepresentado: string;
  /** "homo" for sandbox; "prod" for live. */
  env: AfipEnv;
  /**
   * AFIP service to query.
   *
   * - `ws_sr_constancia_inscripcion` (default, recommended): full constancia
   *   data — name, domicilio, monotributo category, IVA condition, impuestos.
   * - `ws_sr_padron_a13`: datos generales only — no monotributo, no IVA.
   *
   * Both must be separately authorized in your AFIP "Administrador de
   * Relaciones" panel. Default works for most CUIT-lookup use cases.
   */
  service?: AfipPadronService;
  /** Optional custom TA storage (Redis, DB, etc.) for multi-process setups. */
  tokenStore?: TokenStore;
  /** Override WSAA URL (testing only). */
  wsaaEndpoint?: string;
  /** Override WSCDC URL (testing only). */
  wscdcEndpoint?: string;
  /** Custom fetch (testing). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 30s. */
  requestTimeoutMs?: number;
  /** Retries on 5xx + network errors. Default 1. */
  maxRetries?: number;
  /**
   * Observability hook fired after every WSAA + WSCDC request. Useful for
   * logging / metrics / tracing without console-logging from the lib itself.
   */
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}

export class WsaaWscdcAfipPadronAdapter implements AfipPadronAdapter {
  private readonly cache: TokenCache;
  private readonly cuitRepresentado: string;
  private readonly env: AfipEnv;
  private readonly service: AfipPadronService;
  private readonly wscdcEndpoint: string | undefined;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly requestTimeoutMs: number | undefined;
  private readonly maxRetries: number | undefined;
  private readonly onCall: WsaaWscdcAdapterOptions["onCall"];

  constructor(options: WsaaWscdcAdapterOptions) {
    const hasPaths = options.certPath && options.keyPath;
    const hasPems = options.certPem && options.keyPem;
    if ((!hasPaths && !hasPems) || !options.cuitRepresentado) {
      throw new AfipNotConfiguredError();
    }
    this.cache = new TokenCache({
      env: options.env,
      ...(options.certPath !== undefined ? { certPath: options.certPath } : {}),
      ...(options.keyPath !== undefined ? { keyPath: options.keyPath } : {}),
      ...(options.certPem !== undefined ? { certPem: options.certPem } : {}),
      ...(options.keyPem !== undefined ? { keyPem: options.keyPem } : {}),
      ...(options.tokenStore !== undefined ? { store: options.tokenStore } : {}),
      ...(options.wsaaEndpoint !== undefined ? { endpointOverride: options.wsaaEndpoint } : {}),
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.requestTimeoutMs !== undefined ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.onCall !== undefined ? { onCall: options.onCall } : {}),
    });
    this.cuitRepresentado = normalizeCuit(options.cuitRepresentado);
    this.env = options.env;
    this.service = options.service ?? CONSTANCIA_INSCRIPCION_SERVICE_NAME;
    this.wscdcEndpoint = options.wscdcEndpoint;
    this.fetchImpl = options.fetchImpl;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.maxRetries = options.maxRetries;
    this.onCall = options.onCall;
  }

  async lookup(cuit: string): Promise<AfipPadronResult> {
    const normalized = normalizeCuit(cuit);
    if (normalized.length !== 11) {
      return {
        cuit,
        available: false,
        error: `CUIT must be 11 digits; got ${normalized.length}.`,
        data: null,
      };
    }

    let ta;
    try {
      ta = await this.cache.getTicket(this.service);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown WSAA error";
      return {
        cuit: normalized,
        available: false,
        error: `Failed to authenticate with AFIP WSAA: ${message}. Check that the cert is authorized for service ${this.service} in your AFIP account (Administrador de Relaciones → Nueva Relación → AFIP → WebServices).`,
        data: null,
      };
    }

    let result;
    try {
      result = await getPersona({
        ta,
        service: this.service,
        env: this.env,
        cuitRepresentado: this.cuitRepresentado,
        cuitToQuery: normalized,
        ...(this.wscdcEndpoint !== undefined ? { endpointOverride: this.wscdcEndpoint } : {}),
        ...(this.fetchImpl !== undefined ? { fetchImpl: this.fetchImpl } : {}),
        ...(this.requestTimeoutMs !== undefined ? { requestTimeoutMs: this.requestTimeoutMs } : {}),
        ...(this.maxRetries !== undefined ? { maxRetries: this.maxRetries } : {}),
        ...(this.onCall !== undefined ? { onCall: this.onCall } : {}),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown WSCDC error";
      return {
        cuit: normalized,
        available: false,
        error: `Failed to call AFIP getPersona (${this.service}): ${message}.`,
        data: null,
      };
    }

    if (!result.found) {
      return {
        cuit: normalized,
        available: false,
        error: result.rawError ?? `AFIP padron returned no record for CUIT ${normalized}.`,
        data: null,
      };
    }

    return {
      cuit: normalized,
      available: true,
      error: null,
      data: result.data,
    };
  }
}
