/**
 * MuralOffRampAdapter — the self-onboard off-ramp behind the treasury rail.
 *
 * Mural (muralpay.com) is a stablecoin->fiat payouts API with deep LatAm rails.
 * Unlike a sell-from-balance exchange (Manteca) or a deposit-session PSAV (Ripio),
 * Mural is a PAYOUT model: you fund a Mural Account with USDC (on Base), then
 * create + execute a Payout Request that converts USDC->ARS and pays a bank
 * account (CBU/CVU/alias). We integrate it as the off-ramp; we never custody the
 * conversion ourselves. Chosen as the proving path because onboarding is
 * self-driven KYB (no sales gate) and it covers the full USDC->ARS-to-bank loop.
 *
 * GROUNDING — verified against Mural's OpenAPI spec + docs (jun-2026):
 *   - Base URLs: prod https://api.muralpay.com ; sandbox https://api-staging.muralpay.com
 *   - Auth: `authorization: Bearer <apiKey>` on all calls; `transfer-api-key:
 *     <transferApiKey>` additionally on /execute (and /cancel). `on-behalf-of:
 *     <organizationId>` scopes org operations.
 *   - POST /api/payouts/fees/token-to-fiat  { tokenFeeRequests:[{amount:{tokenAmount,
 *       tokenSymbol},fiatAndRailCode:"ars"}] } -> [{type:"success",exchangeRate,
 *       exchangeFeePercentage,estimatedFiatAmount:{fiatAmount,fiatCurrencyCode},
 *       feeTotal:{tokenAmount,tokenSymbol},...} | {type:"error",message,...}]
 *   - POST /api/payouts/payout  { sourceAccountId, memo, payouts:[{amount:{tokenAmount,
 *       tokenSymbol:"USDC"}, payoutDetails:{type:"fiat",bankName,bankAccountOwner,
 *       fiatAndRailDetails:{type:"ars",symbol:"ARS",bankAccountNumber,documentNumber,
 *       bankAccountNumberType:"CVU"|"CBU"|"ALIAS"}}, recipientInfo:{type:"business"|
 *       "individual",...,physicalAddress}}] } -> { id, status:"AWAITING_EXECUTION" }
 *   - POST /api/payouts/payout/{id}/execute    (transfer-api-key) -> status PENDING
 *   - GET  /api/payouts/payout/{id}  -> { status:AWAITING_EXECUTION|PENDING|EXECUTED|
 *       FAILED|CANCELED, payouts:[{details:{fiatPayoutStatus:{type},fiatAmount:{fiatAmount}}}] }
 *   - USDC fund chain enum includes BASE; ARS rail code = "ars".
 *
 * CONFIRM at onboarding (config, one-line fixes):
 *   - baseUrl: defaults to prod; set the sandbox while testing.
 *   - The exact `recipientInfo.physicalAddress` shape your account requires
 *     (passed through verbatim) and whether `on-behalf-of` is needed on payouts.
 *   - Whether the fees `amount` field wants the {tokenAmount,tokenSymbol} object
 *     (sent here) or a bare number — parsed/sent defensively; verify in sandbox.
 *
 * NOT yet live-integration-tested: Mural API keys need a Mural Organization +
 * self-driven KYB (no self-serve key minting, but no sales gate either). Going
 * live = KYB -> keys -> set the config -> run scripts/live-offramp.mjs mural.
 * convert() moves real money; gate behind requireConfirmation (RFC-001).
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

export const MURAL_PROD = "https://api.muralpay.com";
export const MURAL_SANDBOX = "https://api-staging.muralpay.com";

export interface MuralConfig {
  /** General API key — sent as `authorization: Bearer`. */
  apiKey: string;
  /** Transfer API key — sent as `transfer-api-key`, required to execute payouts. */
  transferApiKey: string;
  /** Mural Account id holding the USDC balance (the payout source). */
  sourceAccountId: string;
  /** Organization id; sent as `on-behalf-of` when present. */
  organizationId?: string;
  /** Destination bank (the society's ARS account). */
  bankName: string;
  bankAccountOwner: string;
  /** CBU / CVU / alias value -> `bankAccountNumber`. */
  cvu: string;
  /** How `cvu` is identified. Default "CVU". */
  cvuType?: "CVU" | "CBU" | "ALIAS";
  /** Recipient tax/ID number (e.g. the society's CUIT) -> `documentNumber`. */
  documentNumber: string;
  /** Recipient identity for the payout (the society). */
  recipient: {
    type?: "business" | "individual";
    /** Business name (type=business). */
    name?: string;
    /** Person name (type=individual). */
    firstName?: string;
    lastName?: string;
    email?: string;
    /** Passed through verbatim as recipientInfo.physicalAddress. */
    physicalAddress: unknown;
  };
  /** API base URL. Default = prod. Pass MURAL_SANDBOX while testing. */
  baseUrl?: string;
  /** Crypto sold. Default "USDC". */
  tokenSymbol?: string;
  /** Fiat rail code. Default "ars". */
  fiatRailCode?: string;
  /** Injectable fetch (tests / non-global-fetch runtimes). */
  fetchImpl?: typeof fetch;
  /** Injectable clock for the externalId fallback. Default Date.now. */
  now?: () => number;
}

/** A non-2xx (or transport) failure from the Mural API. */
export class MuralApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "MuralApiError";
  }
}
/** 401/403 — bad or unauthorized api key (or ToS not accepted). */
export class MuralAuthError extends MuralApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "MuralAuthError";
  }
}
/** 429 — rate limited. */
export class MuralRateLimitError extends MuralApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "MuralRateLimitError";
  }
}

/** Coerce a number-ish value (amounts may arrive as strings). */
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/**
 * Normalize Mural's status into our cross-PSAV enum. Prefers the per-payout
 * `fiatPayoutStatus.type` (created/pending/on-hold/completed/failed/canceled/
 * refund*) when present; else falls back to the request-level status. Note: a
 * request status of EXECUTED only means the on-chain leg ran — the fiat may still
 * be settling, so EXECUTED maps to PROCESSING unless the fiat leg is completed.
 */
export function normalizeMuralStatus(
  requestStatus: string | undefined,
  fiatPayoutType?: string,
): OffRampStatus {
  const f = (fiatPayoutType ?? "").toLowerCase();
  if (f) {
    if (f === "completed") return "COMPLETED";
    if (f === "failed" || f === "canceled" || f === "cancelled") return "FAILED";
    if (f === "created") return "PENDING";
    if (["pending", "on-hold", "refundinprogress", "refunded"].includes(f)) return "PROCESSING";
  }
  const s = (requestStatus ?? "").toUpperCase();
  if (s === "EXECUTED" || s === "PENDING") return "PROCESSING";
  if (s === "AWAITING_EXECUTION") return "PENDING";
  if (s === "FAILED" || s === "CANCELED" || s === "CANCELLED") return "FAILED";
  return "UNKNOWN";
}

export class MuralOffRampAdapter implements OffRampAdapter {
  private readonly baseUrl: string;
  private readonly tokenSymbol: string;
  private readonly fiatRailCode: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: MuralConfig) {
    if (!config.apiKey) throw new Error("MuralConfig.apiKey is required");
    if (!config.transferApiKey) throw new Error("MuralConfig.transferApiKey is required");
    if (!config.sourceAccountId) throw new Error("MuralConfig.sourceAccountId is required");
    if (!config.cvu) throw new Error("MuralConfig.cvu is required");
    if (!config.documentNumber) throw new Error("MuralConfig.documentNumber is required");
    this.baseUrl = (config.baseUrl ?? MURAL_PROD).replace(/\/+$/, "");
    this.tokenSymbol = config.tokenSymbol ?? "USDC";
    this.fiatRailCode = config.fiatRailCode ?? "ars";
    const f = config.fetchImpl ?? globalThis.fetch;
    if (!f) throw new Error("no fetch available; pass MuralConfig.fetchImpl");
    this.fetchImpl = f;
    this.now = config.now ?? Date.now;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(this.config.organizationId ? { "on-behalf-of": this.config.organizationId } : {}),
      ...extraHeaders,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      throw new MuralApiError(`mural ${method} ${path} transport error: ${String(cause)}`, 0);
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
      const msg = `mural ${method} ${path} -> ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new MuralAuthError(msg, res.status, parsed);
      if (res.status === 429) throw new MuralRateLimitError(msg, res.status, parsed);
      throw new MuralApiError(msg, res.status, parsed);
    }
    return parsed as T;
  }

  /** Quote a USDC->ARS off-ramp via the token-to-fiat fees endpoint. */
  async quote(amountUsd: Usd): Promise<OffRampQuote> {
    const body = {
      tokenFeeRequests: [
        {
          amount: { tokenAmount: amountUsd, tokenSymbol: this.tokenSymbol },
          fiatAndRailCode: this.fiatRailCode,
        },
      ],
    };
    const res = await this.request<unknown>("POST", "/api/payouts/fees/token-to-fiat", body);
    const first = Array.isArray(res) ? (res[0] as Record<string, unknown>) : undefined;
    if (!first) throw new MuralApiError("mural fees: empty response", 200, res);
    if (first.type === "error") {
      throw new MuralApiError(`mural fees error: ${String(first.message ?? "unknown")}`, 200, first);
    }
    const est = first.estimatedFiatAmount as Record<string, unknown> | undefined;
    const arsOut = num(est?.fiatAmount);
    const rate = num(first.exchangeRate);
    if (arsOut === undefined || rate === undefined || rate <= 0) {
      throw new MuralApiError("mural fees: could not parse rate/estimate", 200, first);
    }
    const spread = num(first.exchangeFeePercentage) ?? 0;
    return { amountUsd, arsOut, rate, spread };
  }

  /**
   * Create + execute the off-ramp payout: convert `amountUsd` USDC and pay ARS to
   * the configured CBU/CVU. IRREVERSIBLE — gate behind requireConfirmation (RFC-001)
   * and write to the signed audit log. Returns the payout-request id as txId;
   * `arsReceived` is the EXPECTED amount (from a fresh quote), the settled figure
   * comes from getStatus.
   */
  async convert(amountUsd: Usd, opts: { externalId: string }): Promise<OffRampReceipt> {
    if (!opts?.externalId)
      throw new Error("MuralOffRampAdapter.convert: externalId (idempotency key) is required");
    const q = await this.quote(amountUsd);
    const memo = opts.externalId;
    const isBusiness = (this.config.recipient.type ?? "business") === "business";
    const recipientInfo = isBusiness
      ? {
          type: "business",
          name: this.config.recipient.name ?? this.config.bankAccountOwner,
          ...(this.config.recipient.email ? { email: this.config.recipient.email } : {}),
          physicalAddress: this.config.recipient.physicalAddress,
        }
      : {
          type: "individual",
          firstName: this.config.recipient.firstName,
          lastName: this.config.recipient.lastName,
          ...(this.config.recipient.email ? { email: this.config.recipient.email } : {}),
          physicalAddress: this.config.recipient.physicalAddress,
        };

    const created = await this.request<{ id?: string; status?: string }>(
      "POST",
      "/api/payouts/payout",
      {
        sourceAccountId: this.config.sourceAccountId,
        memo,
        payouts: [
          {
            amount: { tokenAmount: amountUsd, tokenSymbol: this.tokenSymbol },
            payoutDetails: {
              type: "fiat",
              bankName: this.config.bankName,
              bankAccountOwner: this.config.bankAccountOwner,
              fiatAndRailDetails: {
                type: "ars",
                symbol: "ARS",
                bankAccountNumber: this.config.cvu,
                documentNumber: this.config.documentNumber,
                bankAccountNumberType: this.config.cvuType ?? "CVU",
              },
            },
            recipientInfo,
          },
        ],
      },
    );
    const id = created.id;
    if (!id) throw new MuralApiError("mural payout: response had no id", 200, created);

    await this.request<unknown>(
      "POST",
      `/api/payouts/payout/${encodeURIComponent(id)}/execute`,
      undefined,
      { "transfer-api-key": this.config.transferApiKey },
    );

    return { amountUsd, arsReceived: q.arsOut, rate: q.rate, txId: id };
  }

  /** Poll a payout request and normalize its settlement state. */
  async getStatus(txId: string): Promise<OffRampStatusReport> {
    const body = await this.request<Record<string, unknown>>(
      "GET",
      `/api/payouts/payout/${encodeURIComponent(txId)}`,
    );
    const requestStatus = typeof body.status === "string" ? body.status : undefined;
    const payouts = Array.isArray(body.payouts) ? body.payouts : [];
    const first = payouts[0] as Record<string, unknown> | undefined;
    const details = first?.details as Record<string, unknown> | undefined;
    const fiatStatus = details?.fiatPayoutStatus as Record<string, unknown> | undefined;
    const fiatType = typeof fiatStatus?.type === "string" ? fiatStatus.type : undefined;
    const fiatAmount = details?.fiatAmount as Record<string, unknown> | undefined;
    const arsSettled =
      fiatType === "completed" ? num(fiatAmount?.fiatAmount) : undefined;

    const report: OffRampStatusReport = {
      txId,
      status: normalizeMuralStatus(requestStatus, fiatType),
    };
    const raw = fiatType ?? requestStatus;
    if (raw !== undefined) report.raw = raw;
    if (arsSettled !== undefined) report.arsSettled = arsSettled as Ars;
    return report;
  }
}
