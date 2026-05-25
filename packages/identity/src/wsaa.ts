import { readFileSync } from "node:fs";
import forge from "node-forge";

/**
 * WSAA (Web Service de Autenticación y Autorización) client for Mercado Pago's
 * tax authority AFIP.
 *
 * # Protocol overview
 *
 * AFIP authenticates each service-call session via a "Ticket de Acceso" (TA)
 * that the integration must request from the WSAA endpoint:
 *
 *   1. Build a TRA (Ticket de Requerimiento de Acceso) XML for the target
 *      service (e.g., `ws_sr_padron_a13`).
 *   2. Sign the TRA as a detached PKCS#7 (CMS) blob using the integration's
 *      X.509 certificate + private key. The cert must have been registered
 *      with AFIP via Clave Fiscal and authorized for the target service.
 *   3. POST the base64-encoded CMS to WSAA's `loginCms` SOAP operation.
 *   4. WSAA returns a `loginTicketResponse` XML containing the TA: a `token`,
 *      a `sign`, and an `expirationTime`. The TA is reusable for any call to
 *      that target service until expirationTime (typically ~12 hours).
 *
 * # Why this lives in @ar-agents/identity (not its own package)
 *
 * The padron lookup (`@ar-agents/identity`'s primary purpose) is the most
 * common reason an agent needs WSAA. Bundling them avoids multi-package
 * coordination for the typical use case. Other AFIP services (factura
 * electrónica, etc.) are out of scope for this lib — if you need them,
 * extract WSAA into your own helper.
 *
 * # Subpath import
 *
 * This module is exported as `@ar-agents/identity/wsaa` rather than the
 * package root to keep node-forge out of the main bundle for users who only
 * want pure-algorithm validation.
 */

export type AfipEnv = "homo" | "prod";

const WSAA_URLS: Record<AfipEnv, string> = {
  homo: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  prod: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

/**
 * A successfully obtained Access Ticket. Reuse the same TA for every call to
 * the same `service` until `expirationTime` is reached.
 */
export interface AccessTicket {
  /** AFIP-issued auth token. Pass to WSCDC as <Auth><Token>...</Token></Auth>. */
  token: string;
  /** AFIP-issued signature. Pass to WSCDC as <Auth><Sign>...</Sign></Auth>. */
  sign: string;
  /** Unix epoch ms when this TA expires. After this, request a fresh TA. */
  expirationTimeMs: number;
  /** AFIP service name this TA is valid for. */
  service: string;
}

export interface WsaaOptions {
  /**
   * Path to the integration's X.509 cert in PEM format. Use this for local
   * dev where the cert lives on disk. For Vercel / Lambda / serverless,
   * prefer `certPem` (paste the PEM string into an env var directly).
   *
   * Mutually exclusive with `certPem`. Exactly one of the two must be set.
   */
  certPath?: string;
  /** Path to the matching RSA private key in PEM format. See `certPath`. */
  keyPath?: string;
  /**
   * The X.509 cert as a PEM string. Use this for filesystem-less runtimes
   * (Vercel, Lambda, Cloudflare Workers): paste the contents of the cert
   * into an env var, then read it here. The full string including the
   * `-----BEGIN CERTIFICATE-----` / `-----END CERTIFICATE-----` markers.
   */
  certPem?: string;
  /** The RSA private key as a PEM string. See `certPem`. */
  keyPem?: string;
  /** "homo" for homologación / sandbox; "prod" for production. */
  env: AfipEnv;
  /** Optional: override the WSAA endpoint URL (advanced; for testing). */
  endpointOverride?: string;
}

/**
 * Normalize cert + key inputs to PEM strings, reading from disk if needed.
 * Throws a clear error if neither path-pair nor PEM-pair is provided.
 *
 * Also robust-normalizes PEM strings: when env vars are pasted in dashboards
 * (Vercel, Netlify) the literal `\n` sequence sometimes survives instead of
 * being converted to real newlines, which causes node-forge to throw a
 * cryptic `Cannot read properties of undefined (reading 'toString')`.
 *
 * @internal
 */
function resolveCertAndKey(params: {
  certPath?: string;
  keyPath?: string;
  certPem?: string;
  keyPem?: string;
}): { certPem: string; keyPem: string } {
  const certPem =
    normalizePem(params.certPem) ??
    (params.certPath ? normalizePem(readFileSync(params.certPath, "utf8")) : null);
  const keyPem =
    normalizePem(params.keyPem) ??
    (params.keyPath ? normalizePem(readFileSync(params.keyPath, "utf8")) : null);
  if (!certPem || !keyPem) {
    throw new Error(
      "WsaaOptions requires either { certPath, keyPath } (read from disk) or { certPem, keyPem } (PEM strings inline). For Vercel / serverless, paste the PEMs into env vars and pass them as certPem/keyPem.",
    );
  }
  return { certPem, keyPem };
}

/**
 * Normalize a PEM string: turn literal `\n` (and `\r\n`) sequences into real
 * newlines. If the PEM has BEGIN/END markers but no real newlines (a single
 * line copy-paste accident), reformat it into the canonical 64-char-per-line
 * layout that node-forge expects.
 *
 * @internal
 */
function normalizePem(input: string | undefined): string | undefined {
  if (input === undefined || input === null) return undefined;
  let pem = input.trim();
  if (!pem) return undefined;
  // Convert escaped newlines to real ones (common in env-var dashboards).
  if (pem.includes("\\n")) {
    pem = pem.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  }
  // If still on a single line but BEGIN/END are present, reformat the body.
  if (!pem.includes("\n") && pem.includes("-----BEGIN") && pem.includes("-----END")) {
    const beginMatch = pem.match(/-----BEGIN [^-]+-----/);
    const endMatch = pem.match(/-----END [^-]+-----/);
    if (beginMatch && endMatch) {
      const begin = beginMatch[0];
      const end = endMatch[0];
      const bodyStart = pem.indexOf(begin) + begin.length;
      const bodyEnd = pem.indexOf(end);
      const body = pem.slice(bodyStart, bodyEnd).replace(/\s+/g, "");
      const lines = body.match(/.{1,64}/g) ?? [];
      pem = `${begin}\n${lines.join("\n")}\n${end}\n`;
    }
  }
  return pem;
}

/**
 * Build the TRA (Ticket de Requerimiento de Acceso) XML for a given service.
 *
 * @param service AFIP service name. For padron lookup use `ws_sr_padron_a13`.
 * @param ttlSeconds Validity window the TRA requests; AFIP grants at most
 *                   ~12hrs regardless of what's requested. Default 600.
 *
 * @internal Exported only for testing — most callers use `loginCms()`.
 */
export function buildTraXml(service: string, ttlSeconds = 600): string {
  const now = Math.floor(Date.now() / 1000);
  const generationTime = new Date((now - 60) * 1000).toISOString();
  const expirationTime = new Date((now + ttlSeconds) * 1000).toISOString();
  const uniqueId = String(now);

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

/**
 * Sign a TRA XML as an attached PKCS#7 / CMS blob. Returns the base64-encoded
 * DER bytes ready to embed in a WSAA SOAP envelope.
 *
 * # Why attached, not detached
 *
 * AFIP WSAA verifies the signature against the eContent embedded in the CMS.
 * If you sign as detached (eContent omitted), AFIP can't recompute the hash
 * and rejects with `cms.sign.invalid` ("Firma inválida o algoritmo no
 * soportado"). Always use attached signing here.
 *
 * @internal Exported only for testing.
 */
export function signTra(
  traXml: string,
  certPem: string,
  keyPem: string,
): string {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      // Diagnostic intentionally excludes any byte of the PEM itself
      // (length + has-newline are enough for typical env-var corruption
      // debugging without leaking cert metadata via error logs).
      `Failed to parse certificate PEM (length=${certPem.length}, has\\n=${certPem.includes("\n")}): ${msg}`,
    );
  }
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    privateKey = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      // Same intent as the cert-PEM diagnostic above: never log even
      // a prefix of the key material.
      `Failed to parse private key PEM (length=${keyPem.length}, has\\n=${keyPem.includes("\n")}): ${msg}`,
    );
  }

  try {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(traXml, "utf8");
    p7.addCertificate(cert);
    // node-forge oid lookups are typed as `string | undefined` under
    // noUncheckedIndexedAccess, but at runtime they're always defined for these
    // canonical OIDs. Cast to satisfy TS.
    const oids = forge.pki.oids as Record<string, string | undefined>;
    if (!oids.sha256 || !oids.contentType || !oids.data || !oids.messageDigest || !oids.signingTime) {
      throw new Error(
        `forge.pki.oids missing required entries: sha256=${!!oids.sha256}, contentType=${!!oids.contentType}, data=${!!oids.data}, messageDigest=${!!oids.messageDigest}, signingTime=${!!oids.signingTime}. This usually means node-forge was tree-shaken aggressively by the bundler.`,
      );
    }
    p7.addSigner({
      key: privateKey,
      certificate: cert,
      digestAlgorithm: oids.sha256,
      authenticatedAttributes: [
        { type: oids.contentType, value: oids.data },
        { type: oids.messageDigest },
        // signingTime accepts a Date at runtime; the d.ts is stale.
        { type: oids.signingTime, value: new Date() as unknown as string },
      ],
    });
    // Attached signing: eContent is embedded in the CMS so AFIP can verify.
    p7.sign();

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return forge.util.encode64(der);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`signTra (forge PKCS#7 signing) failed: ${msg}`);
  }
}

/**
 * Build the SOAP envelope for WSAA's `loginCms` operation.
 *
 * @internal Exported only for testing.
 */
export function buildSoapEnvelope(cmsBase64: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsBase64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Parse the WSAA SOAP response and extract the loginTicketResponse XML, then
 * the token/sign/expirationTime fields from it.
 *
 * @internal Exported only for testing.
 */
export function parseLoginTicketResponse(
  soapResponseXml: string,
  service: string,
): AccessTicket {
  // The SOAP body wraps an escaped loginTicketResponse XML. Unescape XML entities.
  const innerMatch = soapResponseXml.match(
    /<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/,
  );
  if (!innerMatch) {
    throw new Error(
      "WSAA response did not contain <loginCmsReturn>. Raw response: " +
        soapResponseXml.slice(0, 500),
    );
  }
  const inner = innerMatch[1]!
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

  const tokenMatch = inner.match(/<token>([\s\S]*?)<\/token>/);
  const signMatch = inner.match(/<sign>([\s\S]*?)<\/sign>/);
  const expMatch = inner.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/);
  if (!tokenMatch || !signMatch || !expMatch) {
    throw new Error(
      "WSAA loginTicketResponse missing required fields. Inner XML: " +
        inner.slice(0, 500),
    );
  }
  return {
    token: tokenMatch[1]!.trim(),
    sign: signMatch[1]!.trim(),
    expirationTimeMs: new Date(expMatch[1]!.trim()).getTime(),
    service,
  };
}

/**
 * Perform the full WSAA login flow: build TRA → sign as CMS → POST to WSAA →
 * parse the returned TA. This is the primary export of this module.
 *
 * The returned `AccessTicket` is reusable for the same service until its
 * `expirationTimeMs`. Callers SHOULD cache it — see `TokenCache` below for
 * the canonical caching pattern.
 *
 * @example
 * ```ts
 * const ta = await loginCms({
 *   service: "ws_sr_padron_a13",
 *   certPath: "/path/to/afip-cert.pem",
 *   keyPath: "/path/to/afip-key.pem",
 *   env: "homo",
 * });
 * console.log(ta.token, ta.sign, new Date(ta.expirationTimeMs));
 * ```
 */
export async function loginCms(params: {
  service: string;
  /** See WsaaOptions: certPath OR certPem (one required). */
  certPath?: string;
  /** See WsaaOptions: keyPath OR keyPem (one required). */
  keyPath?: string;
  /** See WsaaOptions: certPem (inline) OR certPath (filesystem). */
  certPem?: string;
  /** See WsaaOptions: keyPem (inline) OR keyPath (filesystem). */
  keyPem?: string;
  env: AfipEnv;
  endpointOverride?: string;
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 30s. */
  requestTimeoutMs?: number;
  /** Retries on 5xx + network errors. Default 1. */
  maxRetries?: number;
  /** Observability hook fired after every request. */
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}): Promise<AccessTicket> {
  const { certPem, keyPem } = resolveCertAndKey(params);

  const tra = buildTraXml(params.service);
  const cms = signTra(tra, certPem, keyPem);
  const envelope = buildSoapEnvelope(cms);

  const url = params.endpointOverride ?? WSAA_URLS[params.env];
  const text = await fetchWithRetry({
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: envelope,
    },
    label: "wsaa.loginCms",
    requestTimeoutMs: params.requestTimeoutMs ?? 30_000,
    maxRetries: params.maxRetries ?? 1,
    ...(params.fetchImpl !== undefined ? { fetchImpl: params.fetchImpl } : {}),
    ...(params.onCall !== undefined ? { onCall: params.onCall } : {}),
  });
  return parseLoginTicketResponse(text, params.service);
}

/**
 * Internal helper: fetch with timeout + retry on 5xx + observability hook.
 * Used by both loginCms (WSAA) and getPersona (WSCDC) so AFIP integration
 * gets the same robustness floor as our other clients.
 */
export async function fetchWithRetry(params: {
  url: string;
  init: RequestInit;
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
  label?: string;
}): Promise<string> {
  const fetchFn = params.fetchImpl ?? globalThis.fetch;
  const timeoutMs = params.requestTimeoutMs ?? 30_000;
  const maxRetries = Math.max(0, params.maxRetries ?? 1);
  const label = params.label ?? "fetch";
  const t0 = Date.now();
  let attempt = 0;
  let lastStatus: number | null = null;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(params.url, { ...params.init, signal: controller.signal });
      clearTimeout(timer);
      lastStatus = res.status;
      const text = await res.text();

      // SOAP services often return HTTP 500 with a structured Fault body —
      // those are valid responses, not transport errors. Don't retry them.
      const isFault = /<.*Fault[\s>]/i.test(text);

      if (res.ok || (res.status >= 400 && res.status < 500) || isFault) {
        params.onCall?.({
          label,
          durationMs: Date.now() - t0,
          httpStatus: res.status,
          retried: attempt,
          success: res.ok,
        });
        if (!res.ok && !isFault) {
          throw new Error(
            `${label} failed: HTTP ${res.status}. Body: ${text.slice(0, 500)}`,
          );
        }
        return text;
      }

      // 5xx without Fault → retry if budget remains
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt - 1)));
        continue;
      }
      params.onCall?.({
        label,
        durationMs: Date.now() - t0,
        httpStatus: res.status,
        retried: attempt,
        success: false,
      });
      throw new Error(`${label} failed: HTTP ${res.status} after ${maxRetries} retries`);
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      const isHttpError = err instanceof Error && /HTTP \d+/.test(err.message);
      // If it's an HTTP error we already classified, don't retry — re-throw
      if (isHttpError) throw err;
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt - 1)));
        continue;
      }
      params.onCall?.({
        label,
        durationMs: Date.now() - t0,
        httpStatus: lastStatus,
        retried: attempt,
        success: false,
      });
      if (isAbort) {
        throw new Error(
          `${label} timed out after ${timeoutMs}ms`,
        );
      }
      throw err;
    }
  }
  throw new Error(`${label} failed after ${maxRetries} retries`);
}

/**
 * In-memory cache of TAs keyed by service. Refreshes via `loginCms` when the
 * cached TA is missing or within `refreshLeadMs` of expiration.
 *
 * # Production usage
 *
 * For multi-process deployments (Vercel functions, Lambda, etc.), the
 * in-memory cache resets on each cold start. Either:
 *
 *   - Pre-fetch a TA at deploy time and pass it through env vars (cumbersome)
 *   - Add a `persist` adapter that reads/writes the TA from Upstash Redis,
 *     S3, or your DB. Implement `TokenStore` and pass it as an option.
 */
export interface TokenStore {
  get(service: string): Promise<AccessTicket | null>;
  set(service: string, ta: AccessTicket): Promise<void>;
}

export class InMemoryTokenStore implements TokenStore {
  private store = new Map<string, AccessTicket>();
  async get(service: string): Promise<AccessTicket | null> {
    return this.store.get(service) ?? null;
  }
  async set(service: string, ta: AccessTicket): Promise<void> {
    this.store.set(service, ta);
  }
}

export class TokenCache {
  private readonly store: TokenStore;
  constructor(
    private options: WsaaOptions & {
      store?: TokenStore;
      /** Refresh the TA when within this many ms of expiration. Default 5min. */
      refreshLeadMs?: number;
      /** Custom fetch (testing only). */
      fetchImpl?: typeof fetch;
      /** Per-request timeout. Default 30s. */
      requestTimeoutMs?: number;
      /** Retries on 5xx + network errors. Default 1. */
      maxRetries?: number;
      /** Observability hook. */
      onCall?: (event: {
        label: string;
        durationMs: number;
        httpStatus: number | null;
        retried: number;
        success: boolean;
      }) => void;
    },
  ) {
    this.store = options.store ?? new InMemoryTokenStore();
  }

  /**
   * Get a TA for the given service, refreshing if needed. Safe to call on
   * every request — caching makes it cheap.
   */
  async getTicket(service: string): Promise<AccessTicket> {
    const cached = await this.store.get(service);
    const refreshLead = this.options.refreshLeadMs ?? 5 * 60 * 1000;
    if (cached && cached.expirationTimeMs - Date.now() > refreshLead) {
      return cached;
    }
    const fresh = await loginCms({
      service,
      env: this.options.env,
      ...(this.options.certPath !== undefined ? { certPath: this.options.certPath } : {}),
      ...(this.options.keyPath !== undefined ? { keyPath: this.options.keyPath } : {}),
      ...(this.options.certPem !== undefined ? { certPem: this.options.certPem } : {}),
      ...(this.options.keyPem !== undefined ? { keyPem: this.options.keyPem } : {}),
      ...(this.options.endpointOverride !== undefined ? { endpointOverride: this.options.endpointOverride } : {}),
      ...(this.options.fetchImpl !== undefined ? { fetchImpl: this.options.fetchImpl } : {}),
      ...(this.options.requestTimeoutMs !== undefined ? { requestTimeoutMs: this.options.requestTimeoutMs } : {}),
      ...(this.options.maxRetries !== undefined ? { maxRetries: this.options.maxRetries } : {}),
      ...(this.options.onCall !== undefined ? { onCall: this.options.onCall } : {}),
    });
    await this.store.set(service, fresh);
    return fresh;
  }
}
