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
 *      service (e.g., `ws_sr_padron_a5`).
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
  /** Path to the integration's X.509 cert in PEM format. */
  certPath: string;
  /** Path to the matching RSA private key in PEM format. */
  keyPath: string;
  /** "homo" for homologación / sandbox; "prod" for production. */
  env: AfipEnv;
  /** Optional: override the WSAA endpoint URL (advanced; for testing). */
  endpointOverride?: string;
}

/**
 * Build the TRA (Ticket de Requerimiento de Acceso) XML for a given service.
 *
 * @param service AFIP service name. For padron lookup use `ws_sr_padron_a5`.
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
 * Sign a TRA XML as a detached PKCS#7 / CMS blob. Returns the base64-encoded
 * DER bytes ready to embed in a WSAA SOAP envelope.
 *
 * @internal Exported only for testing.
 */
export function signTra(
  traXml: string,
  certPem: string,
  keyPem: string,
): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const privateKey = forge.pki.privateKeyFromPem(keyPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, "utf8");
  p7.addCertificate(cert);
  // node-forge oid lookups are typed as `string | undefined` under
  // noUncheckedIndexedAccess, but at runtime they're always defined for these
  // canonical OIDs. Cast to satisfy TS.
  const oids = forge.pki.oids as Record<string, string>;
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: oids.sha256!,
    authenticatedAttributes: [
      { type: oids.contentType!, value: oids.data! },
      { type: oids.messageDigest! },
      // signingTime accepts a Date at runtime; the d.ts is stale.
      { type: oids.signingTime!, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
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
 *   service: "ws_sr_padron_a5",
 *   certPath: "/path/to/afip-cert.pem",
 *   keyPath: "/path/to/afip-key.pem",
 *   env: "homo",
 * });
 * console.log(ta.token, ta.sign, new Date(ta.expirationTimeMs));
 * ```
 */
export async function loginCms(params: {
  service: string;
  certPath: string;
  keyPath: string;
  env: AfipEnv;
  endpointOverride?: string;
  fetchImpl?: typeof fetch;
}): Promise<AccessTicket> {
  const certPem = readFileSync(params.certPath, "utf8");
  const keyPem = readFileSync(params.keyPath, "utf8");

  const tra = buildTraXml(params.service);
  const cms = signTra(tra, certPem, keyPem);
  const envelope = buildSoapEnvelope(cms);

  const fetchFn = params.fetchImpl ?? globalThis.fetch;
  const url = params.endpointOverride ?? WSAA_URLS[params.env];
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    body: envelope,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `WSAA loginCms failed: HTTP ${res.status}. Body: ${text.slice(0, 500)}`,
    );
  }
  return parseLoginTicketResponse(text, params.service);
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
      certPath: this.options.certPath,
      keyPath: this.options.keyPath,
      env: this.options.env,
      ...(this.options.endpointOverride !== undefined ? { endpointOverride: this.options.endpointOverride } : {}),
      ...(this.options.fetchImpl !== undefined ? { fetchImpl: this.options.fetchImpl } : {}),
    });
    await this.store.set(service, fresh);
    return fresh;
  }
}
