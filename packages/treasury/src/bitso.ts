/**
 * BitsoOffRampAdapter — the self-serve USDT->ARS off-ramp behind the treasury rail.
 *
 * Bitso (bitso.com) is the largest crypto exchange in Argentina, with a public,
 * HMAC-signed Trading API and self-serve API keys (no sales gate, unlike Manteca;
 * no invite wall, unlike Mural). We integrate it as a registered-VASP off-ramp; we
 * never custody the conversion ourselves. This is an EXCHANGE model (like Manteca):
 * deposit the stablecoin -> market-sell it for ARS -> withdraw ARS to the society's
 * CBU/CVU.
 *
 * STABLECOIN = USDT, not USDC. Bitso has NO usdc book and does not custody USDC at
 * all (verified jun-2026: GET /v3/available_books has usdt_ars / usd_ars but no
 * usdc_*; the currency catalogue has usdt, not usdc). USDT is the de-facto dollar
 * stablecoin in Argentina, so the off-ramp standardizes on it. The intake side
 * (x402) therefore settles USDT; if a payer sends USDC, swap it to USDT before
 * this adapter (or off-ramp that leg via Mural's native USDC->ARS instead).
 *
 * GROUNDING — verified against docs.bitso.com + the live public API (jun-2026):
 *   - Base URLs: prod https://api.bitso.com ; sandbox https://api-stage.bitso.com
 *   - Auth (private endpoints): HMAC-SHA256 over `nonce + HTTP_METHOD + request_path
 *     + json_body`, hex; header `Authorization: Bitso {key}:{nonce}:{signature}`.
 *     The signed `request_path` MUST equal the path actually requested (we build it
 *     once and use it for both) — incl. the query string on GETs.
 *   - Responses are enveloped: { success:true, payload } | { success:false, error:{code,message} }.
 *     success:false is an error even on HTTP 200.
 *   - GET  /v3/ticker?book=usdt_ars                 -> payload.bid (sell side) [public]
 *   - POST /v3/orders   { book, side:"sell", type:"market", major }  -> payload.oid
 *   - GET  /v3/balance                              -> payload.balances[{currency,available}]
 *   - POST /v3/withdrawals { asset:"ars", currency:"ars", method:"bind",
 *       network:"coelsa", protocol:"cvu"|"cbu", amount, max_fee, recipient_name,
 *       cvu, origin_id } -> payload.{wid,status}.  `origin_id` (<=40 chars,
 *       [A-Za-z0-9_]) is the idempotency key — Bitso dedupes retries of the SAME
 *       origin_id, so the ARS payout never double-spends.
 *   - GET  /v3/withdrawals?origin_ids={id}          -> existing withdrawal lookup
 *   - GET  /v3/withdrawals/{wid}                    -> status pending|processing|complete|failed
 *
 * IDEMPOTENCY: the ARS payout leg is natively idempotent (origin_id, derived
 * deterministically from `externalId`). convert() also looks the withdrawal up by
 * origin_id FIRST and returns it without re-selling if it already exists — so a
 * retried convert() neither double-sells nor double-pays. As defense in depth,
 * still wrap with withOffRampIdempotency() and gate behind requireConfirmation
 * (RFC-001); convert() moves real money.
 *
 * DEDICATED ACCOUNT: convert() sells the USDT then withdraws the account's ARS
 * available balance (post-fee, exactly what the sale realized). Use a Bitso
 * (sub)account dedicated to this off-ramp so the swept balance == this off-ramp's
 * proceeds and nothing unrelated.
 *
 * CONFIRM at onboarding (config, one-line fixes): the sandbox base URL host; that
 * the account accepts USDT deposits on the intake network (Base, else pick the
 * network at intake); and the exact `protocol` your CVU/CBU uses. Live-prove via
 * scripts/live-offramp.mjs bitso (sandbox first).
 */

import { HttpClient, parseOrThrow, type ResponseSchema } from "@ar-agents/core";
import type {
  Ars,
  OffRampAdapter,
  OffRampQuote,
  OffRampReceipt,
  OffRampStatus,
  OffRampStatusReport,
  Usd,
} from "./index";
import {
  arraySchema,
  mapOffRampError,
  objectSchema,
  type OffRampErrorCtors,
} from "./http";

export const BITSO_PROD = "https://api.bitso.com";
export const BITSO_SANDBOX = "https://api-stage.bitso.com";

export interface BitsoConfig {
  /** API key (the public half), sent in the `Bitso {key}:...` auth header. */
  apiKey: string;
  /** API secret (the HMAC key). NEVER logged. */
  apiSecret: string;
  /** Destination ARS account value (the society's CVU/CBU/alias) -> `cvu`. */
  cvu: string;
  /** Account-holder name on the destination account -> `recipient_name`. */
  recipientName: string;
  /** How `cvu` is identified -> withdrawal `protocol`. Default "cvu". */
  cvuType?: "cvu" | "cbu";
  /** Trading book to sell on. Default "usdt_ars". */
  book?: string;
  /** Withdrawal method / network (AR rail). Defaults: "bind" / "coelsa". */
  withdrawMethod?: string;
  withdrawNetwork?: string;
  /** Max acceptable network fee on the withdrawal (string). Default "0". */
  maxFee?: string;
  /**
   * Quote-only haircut applied to the ticker bid to be conservative in planning
   * (the real fill comes from the post-sale balance). Default 0; Bitso's trading
   * fee is realized in the swept balance, not here.
   */
  spread?: number;
  /** API base URL. Default = prod. Pass BITSO_SANDBOX while testing. */
  baseUrl?: string;
  /**
   * Path prefix before the resource, used for BOTH the request URL and the
   * signed path (they must match exactly). Default "/v3" (the api.bitso.com
   * host). Bitso's docs also show a `bitso.com/api/v3/...` form — if your host
   * needs it, set apiPrefix to "/api/v3". Confirm with one signed call.
   */
  apiPrefix?: string;
  /** Injectable fetch (tests / non-global-fetch runtimes). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number;
  /** Injectable nonce clock (ms). Default Date.now. */
  now?: () => number;
}

/** A non-2xx / `success:false` / transport failure from the Bitso API. */
export class BitsoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "BitsoApiError";
  }
}
/** 401/403 — bad or unauthorized api key / signature. */
export class BitsoAuthError extends BitsoApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "BitsoAuthError";
  }
}
/** 429 — rate limited. */
export class BitsoRateLimitError extends BitsoApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "BitsoRateLimitError";
  }
}

/** Coerce a number-ish value (Bitso returns amounts as strings). */
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

/** HMAC-SHA256 (hex) via Web Crypto — Node 18+, Edge, Workers. */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error("@ar-agents/treasury: Web Crypto subtle unavailable for HMAC");
  }
  const enc = new TextEncoder();
  const key = await c.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await c.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 (hex). Used to derive a Bitso-legal origin_id from any externalId. */
async function sha256Hex(message: string): Promise<string> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error("@ar-agents/treasury: Web Crypto subtle unavailable for SHA-256");
  }
  const digest = await c.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Deterministic Bitso `origin_id` for any caller `externalId`. Bitso requires
 * <=40 chars of [A-Za-z0-9_]; an arbitrary externalId may violate that, so we
 * hash it (collision-resistant, deterministic -> same externalId === same
 * origin_id === Bitso dedupe).
 */
export async function deriveOriginId(externalId: string): Promise<string> {
  return (await sha256Hex(externalId)).slice(0, 40);
}

/** Normalize Bitso's withdrawal status into our cross-PSAV enum. */
export function normalizeBitsoStatus(raw: string | undefined): OffRampStatus {
  const s = (raw ?? "").toLowerCase();
  if (s === "complete" || s === "completed") return "COMPLETED";
  if (s === "failed" || s === "cancelled" || s === "canceled") return "FAILED";
  if (s === "processing") return "PROCESSING";
  if (s === "pending") return "PENDING";
  return "UNKNOWN";
}

interface BitsoWithdrawal {
  wid?: string;
  status?: string;
  amount?: string | number;
  origin_id?: string;
}

/** Provider error ctors passed to the shared core->taxonomy error mapper. */
const BITSO_ERROR_CTORS: OffRampErrorCtors = {
  api: BitsoApiError,
  auth: BitsoAuthError,
  rateLimit: BitsoRateLimitError,
};

/** The Bitso envelope: { success, payload } | { success:false, error:{code,message} }. */
type BitsoEnvelope = {
  success?: boolean;
  payload?: unknown;
  error?: { code?: unknown; message?: unknown };
};

export class BitsoOffRampAdapter implements OffRampAdapter {
  private readonly baseUrl: string;
  private readonly apiPrefix: string;
  private readonly book: string;
  private readonly cvuType: "cvu" | "cbu";
  private readonly withdrawMethod: string;
  private readonly withdrawNetwork: string;
  private readonly maxFee: string;
  private readonly spread: number;
  private readonly client: HttpClient;
  private readonly now: () => number;

  constructor(private readonly config: BitsoConfig) {
    if (!config.apiKey) throw new Error("BitsoConfig.apiKey is required");
    if (!config.apiSecret) throw new Error("BitsoConfig.apiSecret is required");
    if (!config.cvu) throw new Error("BitsoConfig.cvu is required");
    if (!config.recipientName) throw new Error("BitsoConfig.recipientName is required");
    this.baseUrl = (config.baseUrl ?? BITSO_PROD).replace(/\/+$/, "");
    this.apiPrefix = `/${(config.apiPrefix ?? "/v3").replace(/^\/+|\/+$/g, "")}`;
    this.book = config.book ?? "usdt_ars";
    this.cvuType = config.cvuType ?? "cvu";
    this.withdrawMethod = config.withdrawMethod ?? "bind";
    this.withdrawNetwork = config.withdrawNetwork ?? "coelsa";
    this.maxFee = config.maxFee ?? "0";
    this.spread = config.spread ?? 0;
    this.client = new HttpClient({
      baseUrl: this.baseUrl,
      timeoutMs: config.timeoutMs ?? 30_000,
      // Idempotent GET reads (ticker / balance / status / withdrawal lookup) retry
      // a transient 5xx; the money POSTs (place-order, withdrawal) are IRREVERSIBLE
      // and are never marked idempotent, so the client never auto-retries them.
      // (Bitso's own origin_id dedupe protects the withdrawal leg, but we still do
      // NOT blind-retry the sale.)
      retry: { maxAttempts: 3 },
      ...(config.fetchImpl !== undefined ? { fetch: config.fetchImpl } : {}),
    });
    this.now = config.now ?? Date.now;
  }

  /**
   * Signed (or public) request to the Bitso API via the shared client. Bitso's
   * HMAC signs `nonce + METHOD + request_path + body` and the signed path MUST
   * equal the requested path exactly (incl. the query string), so we compute the
   * Authorization header here (per-request nonce/signature) and pass the FULL
   * path — query string included — as the client's `path` (no separate `query`),
   * so what the client sends is byte-identical to what we signed.
   *
   * Uses `requestRaw` (not `request`) because Bitso enveloped errors arrive with
   * HTTP 200 + `success:false`; the client only throws on HTTP >= 400, so we
   * unwrap + validate the envelope ourselves and map every failure into the
   * Bitso error taxonomy. The `payload` is schema-validated so a malformed body
   * cannot fabricate a zero balance / false-success order / bogus quote.
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: { body?: unknown; public?: boolean; schema: (ctx: string) => ResponseSchema<T> },
  ): Promise<T> {
    const payload = opts.body !== undefined ? JSON.stringify(opts.body) : "";
    const headers: Record<string, string> = {};
    if (payload) headers["content-type"] = "application/json";
    if (!opts.public) {
      const nonce = String(this.now());
      const signature = await hmacSha256Hex(
        this.config.apiSecret,
        nonce + method + path + payload,
      );
      headers["authorization"] = `Bitso ${this.config.apiKey}:${nonce}:${signature}`;
    }

    let res: Response;
    try {
      res = await this.client.requestRaw({
        method,
        path,
        headers,
        ...(payload ? { body: payload } : {}),
      });
    } catch (err) {
      throw mapOffRampError(err, `bitso ${method} ${path}`, BITSO_ERROR_CTORS);
    }

    // requestRaw guarantees status < 400; decode + inspect the envelope ourselves.
    let parsed: unknown;
    try {
      const text = await res.text();
      parsed = text ? JSON.parse(text) : undefined;
    } catch (cause) {
      throw new BitsoApiError(`bitso ${method} ${path}: non-JSON body`, res.status, String(cause));
    }
    const env = parsed as BitsoEnvelope | undefined;
    if (env?.success === false) {
      // Enveloped error on HTTP 200 (or 2xx): surface it in the taxonomy.
      const msg = `bitso ${method} ${path} -> ${res.status}${
        env.error?.message ? `: ${String(env.error.message)}` : ""
      }`;
      throw new BitsoApiError(msg, res.status, parsed);
    }
    // Validate the payload SHAPE so a malformed body fails loud instead of being
    // blind-cast into a fabricated result. A validation failure is mapped into the
    // Bitso taxonomy (BitsoApiError 502) — same as every other failure surface —
    // rather than escaping as a raw ArAgentsResponseValidationError.
    try {
      return parseOrThrow(opts.schema(`bitso ${method} ${path} payload`), env?.payload, {
        url: res.url,
        status: res.status,
      });
    } catch (err) {
      throw mapOffRampError(err, `bitso ${method} ${path}`, BITSO_ERROR_CTORS);
    }
  }

  /** Quote a USDT->ARS off-ramp from the public ticker's sell-side (bid). */
  async quote(amountUsd: Usd): Promise<OffRampQuote> {
    const t = await this.request<{ bid?: string }>(
      "GET",
      `${this.apiPrefix}/ticker?book=${encodeURIComponent(this.book)}`,
      { public: true, schema: objectSchema },
    );
    const bid = num(t?.bid);
    if (bid === undefined || bid <= 0) {
      throw new BitsoApiError(`bitso ticker: could not parse a bid for ${this.book}`, 200, t);
    }
    const rate = bid * (1 - this.spread);
    return { amountUsd, arsOut: amountUsd * rate, rate, spread: this.spread };
  }

  /** Read the account's available ARS balance (the swept off-ramp proceeds). */
  private async availableArs(): Promise<string | undefined> {
    const bal = await this.request<{ balances?: Array<{ currency?: string; available?: string }> }>(
      "GET",
      `${this.apiPrefix}/balance`,
      { schema: objectSchema },
    );
    const row = (bal?.balances ?? []).find((b) => b.currency === "ars");
    return row?.available;
  }

  /** Look an existing withdrawal up by its origin_id (idempotency pre-check). */
  private async findWithdrawalByOriginId(originId: string): Promise<BitsoWithdrawal | undefined> {
    try {
      const list = await this.request<BitsoWithdrawal[]>(
        "GET",
        `${this.apiPrefix}/withdrawals?origin_ids=${encodeURIComponent(originId)}`,
        { schema: arraySchema },
      );
      return Array.isArray(list) ? list.find((w) => w.origin_id === originId) ?? list[0] : undefined;
    } catch {
      // Best-effort: if the lookup fails, fall through to the wrapper's idempotency.
      return undefined;
    }
  }

  /**
   * Off-ramp: market-sell the USDT, then withdraw the realized ARS to the
   * configured CBU/CVU. IRREVERSIBLE — gate behind requireConfirmation (RFC-001)
   * and write to the signed audit log. Idempotent on `externalId`: if a withdrawal
   * for the derived origin_id already exists, returns it WITHOUT re-selling.
   * Returns the withdrawal id as txId; the ARS settles asynchronously (getStatus).
   */
  async convert(amountUsd: Usd, opts: { externalId: string }): Promise<OffRampReceipt> {
    if (!opts?.externalId) {
      throw new Error("BitsoOffRampAdapter.convert: externalId (idempotency key) is required");
    }
    const originId = await deriveOriginId(opts.externalId);

    // Idempotency pre-check: a prior convert() with this externalId already paid out.
    const existing = await this.findWithdrawalByOriginId(originId);
    if (existing?.wid) {
      const ars = num(existing.amount) ?? 0;
      return {
        amountUsd,
        arsReceived: ars,
        rate: amountUsd > 0 ? ars / amountUsd : 0,
        txId: existing.wid,
      };
    }

    // 1. Market-sell the USDT for ARS (major = base-asset amount to sell).
    //    IRREVERSIBLE money POST: not marked idempotent -> never auto-retried.
    await this.request<{ oid?: string }>("POST", `${this.apiPrefix}/orders`, {
      body: { book: this.book, side: "sell", type: "market", major: String(amountUsd) },
      schema: objectSchema,
    });

    // 2. Sweep the realized ARS (post-fee balance of the dedicated off-ramp account).
    const arsAvailable = await this.availableArs();
    const arsNum = num(arsAvailable);
    if (!arsAvailable || arsNum === undefined || arsNum <= 0) {
      throw new BitsoApiError("bitso: no ARS balance available after the USDT sale", 200, {
        arsAvailable,
      });
    }

    // 3. Withdraw ARS to the CBU/CVU. IRREVERSIBLE money POST: not marked
    //    idempotent -> the client never auto-retries it. Bitso's own origin_id
    //    dedupe (server-side) is the retry-safety net, exercised only by an
    //    EXPLICIT convert() retry, never by a blind transport retry.
    const wd = await this.request<BitsoWithdrawal>("POST", `${this.apiPrefix}/withdrawals`, {
      body: {
        asset: "ars",
        currency: "ars",
        method: this.withdrawMethod,
        network: this.withdrawNetwork,
        protocol: this.cvuType,
        amount: arsAvailable,
        max_fee: this.maxFee,
        recipient_name: this.config.recipientName,
        cvu: this.config.cvu,
        origin_id: originId,
      },
      schema: objectSchema,
    });
    if (!wd?.wid) {
      throw new BitsoApiError("bitso withdrawal: response had no wid", 200, wd);
    }
    return {
      amountUsd,
      arsReceived: arsNum,
      rate: arsNum / amountUsd,
      txId: wd.wid,
    };
  }

  /** Poll a withdrawal and normalize its settlement state. */
  async getStatus(txId: string): Promise<OffRampStatusReport> {
    const wd = await this.request<BitsoWithdrawal>(
      "GET",
      `${this.apiPrefix}/withdrawals/${encodeURIComponent(txId)}`,
      { schema: objectSchema },
    );
    const raw = typeof wd?.status === "string" ? wd.status : undefined;
    const status = normalizeBitsoStatus(raw);
    const report: OffRampStatusReport = { txId, status };
    if (raw !== undefined) report.raw = raw;
    const settled = status === "COMPLETED" ? num(wd?.amount) : undefined;
    if (settled !== undefined) report.arsSettled = settled as Ars;
    return report;
  }
}
