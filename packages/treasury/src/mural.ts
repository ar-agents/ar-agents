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

import { HttpClient, type ResponseSchema } from "@ar-agents/core";
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
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number;
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

/** Provider error ctors passed to the shared core->taxonomy error mapper. */
const MURAL_ERROR_CTORS: OffRampErrorCtors = {
  api: MuralApiError,
  auth: MuralAuthError,
  rateLimit: MuralRateLimitError,
};

export class MuralOffRampAdapter implements OffRampAdapter {
  private readonly baseUrl: string;
  private readonly tokenSymbol: string;
  private readonly fiatRailCode: string;
  private readonly client: HttpClient;
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
    this.client = new HttpClient({
      baseUrl: this.baseUrl,
      timeoutMs: config.timeoutMs ?? 30_000,
      // Idempotent GET reads (payout status) retry a transient 5xx; every money
      // POST (create payout, execute) is IRREVERSIBLE and is never marked
      // idempotent, so the client never auto-retries it. The fees quote is also
      // a POST and stays conservatively non-retried.
      retry: { maxAttempts: 3 },
      defaultHeaders: {
        authorization: `Bearer ${config.apiKey}`,
        ...(config.organizationId ? { "on-behalf-of": config.organizationId } : {}),
      },
      ...(config.fetchImpl !== undefined ? { fetch: config.fetchImpl } : {}),
    });
    this.now = config.now ?? Date.now;
  }

  /**
   * Request via the shared client. The 2xx body is schema-validated (rejects an
   * HTML error page / null / wrong JSON kind) so a malformed money/state body
   * fails LOUD instead of being blind-cast into a fabricated result. Every core
   * transport error (timeout, network, 4xx/5xx, validation) is mapped back into
   * the Mural error taxonomy.
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: { body?: unknown; headers?: Record<string, string>; schema: ResponseSchema<T> },
  ): Promise<T> {
    try {
      return await this.client.request<T>({
        method,
        path,
        schema: opts.schema,
        ...(opts.body !== undefined ? { body: opts.body } : {}),
        ...(opts.headers !== undefined ? { headers: opts.headers } : {}),
      });
    } catch (err) {
      throw mapOffRampError(err, `mural ${method} ${path}`, MURAL_ERROR_CTORS);
    }
  }

  /**
   * Fire-and-check request whose success body the caller ignores (the execute
   * leg). Uses `requestRaw` so an empty or non-JSON 2xx body is tolerated, while
   * the full timeout + typed-error pipeline still applies.
   */
  private async requestVoid(
    method: "GET" | "POST",
    path: string,
    headers?: Record<string, string>,
  ): Promise<void> {
    try {
      await this.client.requestRaw({
        method,
        path,
        ...(headers !== undefined ? { headers } : {}),
      });
    } catch (err) {
      throw mapOffRampError(err, `mural ${method} ${path}`, MURAL_ERROR_CTORS);
    }
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
    const res = await this.request<unknown[]>("POST", "/api/payouts/fees/token-to-fiat", {
      body,
      schema: arraySchema("mural fees"),
    });
    const first = res[0] as Record<string, unknown> | undefined;
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

    // IRREVERSIBLE money POST: never marked idempotent, so the shared client
    // never auto-retries it (a duplicate payout request would double-pay).
    const created = await this.request<{ id?: string; status?: string }>(
      "POST",
      "/api/payouts/payout",
      {
        body: {
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
        schema: objectSchema("mural payout"),
      },
    );
    const id = created.id;
    if (!id) throw new MuralApiError("mural payout: response had no id", 200, created);

    await this.requestVoid(
      "POST",
      `/api/payouts/payout/${encodeURIComponent(id)}/execute`,
      { "transfer-api-key": this.config.transferApiKey },
    );

    return { amountUsd, arsReceived: q.arsOut, rate: q.rate, txId: id };
  }

  /** Poll a payout request and normalize its settlement state. */
  async getStatus(txId: string): Promise<OffRampStatusReport> {
    const body = await this.request<Record<string, unknown>>(
      "GET",
      `/api/payouts/payout/${encodeURIComponent(txId)}`,
      { schema: objectSchema("mural payout status") },
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
