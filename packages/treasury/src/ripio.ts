/**
 * RipioOffRampAdapter — the second registered-PSAV off-ramp behind the treasury
 * rail, proving the OffRampAdapter interface is provider-agnostic (no single-PSAV
 * lock-in). Ripio's operating entity (Moonbird SRL) is a CNV-registered PSAV.
 *
 * Ripio's off-ramp is a SESSION model (unlike Manteca's sell-from-balance): you
 * create a session bound to a fiat account (the society's CVU), Ripio returns a
 * deposit ADDRESS, the society sends USDC there, and Ripio converts + pays ARS to
 * the CVU. So convert() creates the session and returns the deposit address (on
 * the receipt); completion needs an on-chain transfer the society makes from its
 * wallet, then getStatus() tracks it.
 *
 * GROUNDING (docs.ripio.com, jun-2026):
 *   - Auth: OAuth2 client-credentials. POST /oauth2/token/ with
 *     `Authorization: Basic base64(clientId:clientSecret)` + body
 *     `grant_type=client_credentials` -> { access_token, token_type, expires_in }.
 *     Then `Authorization: Bearer <token>`.
 *   - POST /api/v1/quotes/        { fromCurrency, toCurrency, fromAmount, chain, paymentMethodType }
 *                                 -> { quoteId, rate, toAmount, finalToAmount, fees[], expiration }
 *   - POST /api/v1/fiatAccounts/  { customerId, paymentMethodType, accountFields:{ alias_or_cvu_destination } }
 *                                 -> { id, status }            (one-time CVU registration)
 *   - POST /api/v1/offrampSession/ { fiatAccountId, ... }      -> { sessionId, depositAddresses:[{chain,address}], ... }
 *   - GET  /api/v1/offrampSession/{id}                          -> session status
 *
 * CONFIRM at onboarding (all config, sales-gated credentials):
 *   - baseUrl: defaults to the sandbox; pass prod to go live.
 *   - `chain`: defaults to "BASE" — Ripio's public docs only enumerate ETHEREUM
 *     in static examples; confirm Base/USDC is enabled via GET /api/v1/depositNetworks/.
 *   - The exact offrampSession request body + status enum (parsed defensively here).
 *
 * Request contract pinned + unit-tested vs mocked HTTP. LIVE-PROBED 2026-06-24:
 * the sandbox host is up and `POST /oauth2/token/` returns `{error:"invalid_client"}`
 * (401) while `POST /api/v1/quotes/` returns 401 — the exact wire + error shapes
 * this adapter handles (RipioAuthError), verified up to the credential boundary.
 * Only sales-gated client creds remain; Ripio is the soonest path to a full live
 * run (open sandbox + deposit simulation). Run: `scripts/live-offramp.mjs ripio`.
 */

import type {
  Ars,
  OffRampAdapter,
  OffRampQuote,
  OffRampReceipt,
  OffRampStatus,
  OffRampStatusReport,
  Usd,
} from "./index";

export const RIPIO_SANDBOX = "https://sandbox-b2b.ripio.com";
export const RIPIO_PROD = "https://b2b-api.ripio.com";

export interface RipioConfig {
  clientId: string;
  clientSecret: string;
  /** Ripio B2B customer id (the KYC'd society). */
  customerId: string;
  /** Pre-registered fiat account id (the society's CVU). See registerFiatAccount. */
  fiatAccountId: string;
  /** API base URL. Default = sandbox. Pass RIPIO_PROD for live. */
  baseUrl?: string;
  /** Settlement chain. Default "BASE". CONFIRM Base is enabled for your account. */
  chain?: string;
  /** Crypto sold. Default "USDC". */
  fromCurrency?: string;
  /** Fiat received. Default "ARS". */
  toCurrency?: string;
  /** Default "bank_transfer". */
  paymentMethodType?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class RipioApiError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) {
    super(message);
    this.name = "RipioApiError";
  }
}
export class RipioAuthError extends RipioApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "RipioAuthError";
  }
}
export class RipioRateLimitError extends RipioApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "RipioRateLimitError";
  }
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Normalize Ripio's off-ramp session status into our cross-PSAV enum. */
export function normalizeRipioStatus(raw: string | undefined): OffRampStatus {
  const s = (raw ?? "").toUpperCase();
  if (["COMPLETED", "COMPLETE", "DONE", "SETTLED", "SUCCESS", "FINISHED", "PAID"].includes(s))
    return "COMPLETED";
  if (["FAILED", "FAILURE", "ERROR", "REJECTED", "CANCELLED", "CANCELED", "EXPIRED"].includes(s))
    return "FAILED";
  if (["PROCESSING", "IN_PROGRESS", "INPROGRESS", "RUNNING", "PARTIAL", "CONFIRMING"].includes(s))
    return "PROCESSING";
  if (["PENDING", "CREATED", "NEW", "QUEUED", "WAITING", "OPEN", "AWAITING_DEPOSIT"].includes(s))
    return "PENDING";
  return "UNKNOWN";
}

export class RipioOffRampAdapter implements OffRampAdapter {
  private readonly baseUrl: string;
  private readonly chain: string;
  private readonly fromCurrency: string;
  private readonly toCurrency: string;
  private readonly paymentMethodType: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private token: { value: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: RipioConfig) {
    if (!config.clientId || !config.clientSecret)
      throw new Error("RipioConfig.clientId/clientSecret are required");
    if (!config.customerId) throw new Error("RipioConfig.customerId is required");
    if (!config.fiatAccountId) throw new Error("RipioConfig.fiatAccountId is required");
    this.baseUrl = (config.baseUrl ?? RIPIO_SANDBOX).replace(/\/+$/, "");
    this.chain = config.chain ?? "BASE";
    this.fromCurrency = config.fromCurrency ?? "USDC";
    this.toCurrency = config.toCurrency ?? "ARS";
    this.paymentMethodType = config.paymentMethodType ?? "bank_transfer";
    const f = config.fetchImpl ?? globalThis.fetch;
    if (!f) throw new Error("no fetch available; pass RipioConfig.fetchImpl");
    this.fetchImpl = f;
    this.now = config.now ?? Date.now;
  }

  private async getToken(): Promise<string> {
    const now = this.now();
    if (this.token && this.token.expiresAtMs > now + 30_000) return this.token.value;
    const basic = btoa(`${this.config.clientId}:${this.config.clientSecret}`);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/oauth2/token/`, {
        method: "POST",
        headers: {
          authorization: `Basic ${basic}`,
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: "grant_type=client_credentials",
      });
    } catch (cause) {
      throw new RipioApiError(`ripio token transport error: ${String(cause)}`, 0);
    }
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) throw new RipioAuthError(`ripio token -> ${res.status}`, res.status, parsed);
    const body = parsed as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new RipioAuthError("ripio token: no access_token", 200, parsed);
    this.token = {
      value: body.access_token,
      expiresAtMs: now + (body.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      throw new RipioApiError(`ripio ${method} ${path} transport error: ${String(cause)}`, 0);
    }
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      const msg = `ripio ${method} ${path} -> ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new RipioAuthError(msg, res.status, parsed);
      if (res.status === 429) throw new RipioRateLimitError(msg, res.status, parsed);
      throw new RipioApiError(msg, res.status, parsed);
    }
    return parsed as T;
  }

  async quote(amountUsd: Usd): Promise<OffRampQuote> {
    const body = await this.request<Record<string, unknown>>("POST", "/api/v1/quotes/", {
      fromCurrency: this.fromCurrency,
      toCurrency: this.toCurrency,
      fromAmount: String(amountUsd),
      chain: this.chain,
      paymentMethodType: this.paymentMethodType,
    });
    const arsOut = num(body.finalToAmount) ?? num(body.toAmount);
    if (arsOut === undefined || arsOut <= 0) {
      throw new RipioApiError("ripio quote: could not parse toAmount", 200, body);
    }
    const rate = num(body.rate) ?? arsOut / amountUsd;
    return { amountUsd, arsOut, rate, spread: 0 };
  }

  /**
   * Create an off-ramp session for `amountUsd`. Returns a receipt whose
   * `depositAddress` is where the society must send the USDC to complete the
   * payout; `txId` is the session id for getStatus. `arsReceived` is the EXPECTED
   * amount (from a fresh quote); the settled figure comes from getStatus.
   */
  async convert(amountUsd: Usd, _opts?: { externalId?: string }): Promise<OffRampReceipt> {
    const q = await this.quote(amountUsd);
    const session = await this.request<Record<string, unknown>>(
      "POST",
      "/api/v1/offrampSession/",
      {
        fiatAccountId: this.config.fiatAccountId,
        fromCurrency: this.fromCurrency,
        toCurrency: this.toCurrency,
        fromAmount: String(amountUsd),
        chain: this.chain,
      },
    );
    const txId =
      (typeof session.sessionId === "string" && session.sessionId) ||
      (typeof session.id === "string" && session.id) ||
      "";
    if (!txId) throw new RipioApiError("ripio offrampSession: no session id", 200, session);

    const receipt: OffRampReceipt = {
      amountUsd,
      arsReceived: q.arsOut,
      rate: q.rate,
      txId,
    };
    const deposit = this.pickDepositAddress(session.depositAddresses);
    if (deposit) receipt.depositAddress = deposit;
    return receipt;
  }

  private pickDepositAddress(raw: unknown): string | undefined {
    if (!Array.isArray(raw)) return undefined;
    const entries = raw as Array<{ chain?: string; address?: string }>;
    const match = entries.find((e) => (e.chain ?? "").toUpperCase() === this.chain.toUpperCase());
    return (match ?? entries[0])?.address;
  }

  async getStatus(txId: string): Promise<OffRampStatusReport> {
    const body = await this.request<Record<string, unknown>>(
      "GET",
      `/api/v1/offrampSession/${encodeURIComponent(txId)}`,
    );
    const rawStatus =
      (typeof body.status === "string" && body.status) ||
      (typeof body.state === "string" && body.state) ||
      undefined;
    const arsSettled = num(body.finalToAmount) ?? num(body.toAmount) ?? num(body.arsAmount);
    const report: OffRampStatusReport = {
      txId,
      status: normalizeRipioStatus(rawStatus),
    };
    if (rawStatus !== undefined) report.raw = rawStatus;
    if (arsSettled !== undefined) report.arsSettled = arsSettled as Ars;
    return report;
  }

  /**
   * One-time onboarding helper: register the society's CBU/CVU/alias as a fiat
   * account payout destination. Returns the id to use as `fiatAccountId`.
   */
  async registerFiatAccount(input: {
    cbuOrCvuOrAlias: string;
  }): Promise<{ fiatAccountId: string; raw: unknown }> {
    const body = await this.request<Record<string, unknown>>("POST", "/api/v1/fiatAccounts/", {
      customerId: this.config.customerId,
      paymentMethodType: this.paymentMethodType,
      accountFields: { alias_or_cvu_destination: input.cbuOrCvuOrAlias },
    });
    const id =
      (typeof body.id === "string" && body.id) ||
      (typeof body.fiatAccountId === "string" && body.fiatAccountId) ||
      "";
    return { fiatAccountId: id, raw: body };
  }
}
