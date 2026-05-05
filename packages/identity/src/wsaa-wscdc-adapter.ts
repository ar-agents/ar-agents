import type { AfipPadronAdapter } from "./afip";
import { AfipNotConfiguredError } from "./errors";
import type { AfipPadronResult } from "./types";
import {
  TokenCache,
  type AfipEnv,
  type TokenStore,
} from "./wsaa";
import {
  getPersonaV2,
  WSCDC_SERVICE_NAME,
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
 *    authorizing the alias to use the `ws_sr_padron_a5` service. For
 *    homologación testing, also authorize the homo variant.
 * 4. Wire the adapter:
 *    ```ts
 *    import { identityTools } from "@ar-agents/identity";
 *    import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
 *
 *    const afip = new WsaaWscdcAfipPadronAdapter({
 *      certPath: process.env.AFIP_CERT_PATH!,
 *      keyPath: process.env.AFIP_KEY_PATH!,
 *      cuitRepresentado: process.env.AFIP_CUIT!, // your CUIT
 *      env: "homo", // or "prod"
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
  /** Absolute path to the X.509 certificate PEM (the file AFIP issued). */
  certPath: string;
  /** Absolute path to the matching RSA private key PEM. */
  keyPath: string;
  /**
   * The CUIT whose Clave Fiscal authorized the certificate. AFIP requires
   * this in every call as `cuitRepresentada`.
   */
  cuitRepresentado: string;
  /** "homo" for sandbox; "prod" for live. */
  env: AfipEnv;
  /** Optional custom TA storage (Redis, DB, etc.) for multi-process setups. */
  tokenStore?: TokenStore;
  /** Override WSAA URL (testing only). */
  wsaaEndpoint?: string;
  /** Override WSCDC URL (testing only). */
  wscdcEndpoint?: string;
  /** Custom fetch (testing). */
  fetchImpl?: typeof fetch;
}

export class WsaaWscdcAfipPadronAdapter implements AfipPadronAdapter {
  private readonly cache: TokenCache;
  private readonly cuitRepresentado: string;
  private readonly env: AfipEnv;
  private readonly wscdcEndpoint: string | undefined;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: WsaaWscdcAdapterOptions) {
    if (!options.certPath || !options.keyPath || !options.cuitRepresentado) {
      throw new AfipNotConfiguredError();
    }
    this.cache = new TokenCache({
      certPath: options.certPath,
      keyPath: options.keyPath,
      env: options.env,
      ...(options.tokenStore !== undefined ? { store: options.tokenStore } : {}),
      ...(options.wsaaEndpoint !== undefined ? { endpointOverride: options.wsaaEndpoint } : {}),
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    });
    this.cuitRepresentado = normalizeCuit(options.cuitRepresentado);
    this.env = options.env;
    this.wscdcEndpoint = options.wscdcEndpoint;
    this.fetchImpl = options.fetchImpl;
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
      ta = await this.cache.getTicket(WSCDC_SERVICE_NAME);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown WSAA error";
      return {
        cuit: normalized,
        available: false,
        error: `Failed to authenticate with AFIP WSAA: ${message}. Check that AFIP_CERT_PATH + AFIP_KEY_PATH point to valid PEMs and that the cert is authorized for service ws_sr_padron_a5 in your AFIP account.`,
        data: null,
      };
    }

    let result;
    try {
      result = await getPersonaV2({
        ta,
        env: this.env,
        cuitRepresentado: this.cuitRepresentado,
        cuitToQuery: normalized,
        ...(this.wscdcEndpoint !== undefined ? { endpointOverride: this.wscdcEndpoint } : {}),
        ...(this.fetchImpl !== undefined ? { fetchImpl: this.fetchImpl } : {}),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown WSCDC error";
      return {
        cuit: normalized,
        available: false,
        error: `Failed to call AFIP WSCDC getPersona_v2: ${message}.`,
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
