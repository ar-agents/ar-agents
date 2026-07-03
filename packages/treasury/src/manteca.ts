/**
 * MantecaOffRampAdapter — the real PSAV off-ramp behind the treasury rail.
 *
 * Manteca (manteca.dev) is an Argentine crypto-fiat infrastructure provider. We
 * integrate it as a registered-PSAV off-ramp; we never custody the conversion
 * ourselves (CNV RG 1058/2025). This is a thin, typed client over Manteca's
 * documented v2 API.
 *
 * GROUNDING — what is verified vs. what to confirm at onboarding
 * ─────────────────────────────────────────────────────────────
 * VERIFIED from docs.manteca.dev / developers.manteca.dev (jun-2026):
 *   - Auth header is `md-api-key`.
 *   - GET  /v2/prices/direct/{ticker}                 (a direct pair price)
 *   - POST /v2/price-locks            {userAnyId,side,asset,against} -> {code,price}
 *   - POST /v2/synthetics/ramp-off    {userId,sellAmount,sellAsset,withdrawAsset,
 *                                       bankAccountId,externalId?} -> {id,status,stages[],...}
 *   - GET  /v2/synthetics/{id}                         (synthetic status)
 *   - POST /v2/onboarding-actions/add-bank-account     (register a CBU/CVU/alias; needs legalId)
 *   - 429 responses carry internalStatus: "RATE_LIMITED".
 *   - `externalId` is the idempotency key on synthetics/orders/withdraws.
 *
 * CONFIRM with your account before going to prod (all are config, one-line fixes):
 *   - `baseUrl`: defaults to https://api.manteca.dev. The PUBLIC DOCS host is
 *     developers.manteca.dev; the live API host ships with your credentials.
 *   - `ticker`: defaults to "USDC_ARS"; confirm the exact pair string.
 *   - The JSON shape of the price response and the synthetic status enum — both
 *     are parsed DEFENSIVELY here and normalized; verify against a sandbox call.
 *
 * NOT yet integration-tested: Manteca onboarding is sales-gated (no self-serve
 * keys), so this client is unit-tested against mocked HTTP (the request contract
 * is pinned exactly). LIVE-PROBED 2026-06-24: api.manteca.dev is reachable but the
 * live API host + price path ship per-account (GET /v2/prices/direct/USDC_ARS ->
 * 404 unauth), so there is no public proving surface — confirm the host + ticker
 * at onboarding. Going live = set the 3 config items above. See
 * ../../TREASURY-FISCAL-RAIL.md §5. Run: `scripts/live-offramp.mjs manteca`.
 */

import { HttpClient } from "@ar-agents/core";
import type {
  Ars,
  OffRampAdapter,
  OffRampQuote,
  OffRampReceipt,
  OffRampStatus,
  OffRampStatusReport,
  Usd,
} from "./index";
import { mapOffRampError, objectSchema, type OffRampErrorCtors } from "./http";

export interface MantecaConfig {
  /** API key, sent as the `md-api-key` header. */
  apiKey: string;
  /** Manteca user/company id that owns the crypto balance + the bank account. */
  userId: string;
  /** Registered destination bank account id (the society's CVU) for ARS payout. */
  bankAccountId: string;
  /**
   * API base URL. Default https://api.manteca.dev. CONFIRM at onboarding — the
   * public docs live at developers.manteca.dev; the live API host comes with
   * your credentials.
   */
  baseUrl?: string;
  /** Crypto asset sold. Default "USDC". */
  sellAsset?: string;
  /** Fiat received + withdrawn. Default "ARS". */
  fiatAsset?: string;
  /**
   * Pair ticker for quote(). Default `${sellAsset}_${fiatAsset}` ("USDC_ARS").
   * Confirm the exact string accepted by /v2/prices/direct for your account.
   */
  ticker?: string;
  /** Injectable fetch (tests / non-global-fetch runtimes). Default global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number;
  /** Injectable clock for the externalId fallback. Default Date.now. */
  now?: () => number;
}

/** A non-2xx (or transport) failure from the Manteca API. */
export class MantecaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "MantecaApiError";
  }
}
/** 401/403 — bad or unauthorized api key. */
export class MantecaAuthError extends MantecaApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "MantecaAuthError";
  }
}
/** 429 — per-user rate limit (internalStatus RATE_LIMITED). */
export class MantecaRateLimitError extends MantecaApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "MantecaRateLimitError";
  }
}

const DEFAULT_BASE_URL = "https://api.manteca.dev";

/** Coerce a number-ish value (Manteca returns amounts as strings). */
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

/**
 * Pull the sell-side price out of a direct-price response. The off-ramp SELLS
 * crypto for ARS, so we prefer the sell/bid side. Handles a flat `{price}`, a
 * `{sell,buy}` spread, or a ticker-keyed `{ [ticker]: {...} }` envelope.
 */
export function parseDirectPrice(body: unknown, ticker: string): number | undefined {
  const fromObj = (o: unknown): number | undefined => {
    const direct = num(o);
    if (direct !== undefined) return direct;
    if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      for (const k of ["sell", "bid", "price", "ask", "buy", "value", "rate"]) {
        const v = num(rec[k]);
        if (v !== undefined) return v;
      }
    }
    return undefined;
  };
  const env = body as Record<string, unknown> | null | undefined;
  return fromObj(env?.[ticker]) ?? fromObj(body);
}

/** Normalize Manteca's synthetic status string into our cross-PSAV enum. */
export function normalizeMantecaStatus(raw: string | undefined): OffRampStatus {
  const s = (raw ?? "").toUpperCase();
  if (["COMPLETED", "COMPLETE", "DONE", "SETTLED", "SUCCESS", "FINISHED"].includes(s))
    return "COMPLETED";
  if (["FAILED", "FAILURE", "ERROR", "REJECTED", "CANCELLED", "CANCELED"].includes(s))
    return "FAILED";
  if (["PROCESSING", "IN_PROGRESS", "INPROGRESS", "RUNNING", "PARTIAL"].includes(s))
    return "PROCESSING";
  if (["PENDING", "CREATED", "NEW", "QUEUED", "WAITING"].includes(s)) return "PENDING";
  return "UNKNOWN";
}

/** Provider error ctors passed to the shared core->taxonomy error mapper. */
const MANTECA_ERROR_CTORS: OffRampErrorCtors = {
  api: MantecaApiError,
  auth: MantecaAuthError,
  rateLimit: MantecaRateLimitError,
};

export class MantecaOffRampAdapter implements OffRampAdapter {
  private readonly baseUrl: string;
  private readonly sellAsset: string;
  private readonly fiatAsset: string;
  private readonly ticker: string;
  private readonly client: HttpClient;
  private readonly now: () => number;

  constructor(private readonly config: MantecaConfig) {
    if (!config.apiKey) throw new Error("MantecaConfig.apiKey is required");
    if (!config.userId) throw new Error("MantecaConfig.userId is required");
    if (!config.bankAccountId)
      throw new Error("MantecaConfig.bankAccountId is required");
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.sellAsset = config.sellAsset ?? "USDC";
    this.fiatAsset = config.fiatAsset ?? "ARS";
    this.ticker = config.ticker ?? `${this.sellAsset}_${this.fiatAsset}`;
    this.client = new HttpClient({
      baseUrl: this.baseUrl,
      timeoutMs: config.timeoutMs ?? 30_000,
      // Idempotent GET reads (quote / status) retry a transient 5xx; the money
      // POST (ramp-off) is IRREVERSIBLE and is never marked idempotent, so it is
      // never auto-retried — a timeout-after-submit must not fire a second sale.
      retry: { maxAttempts: 3 },
      defaultHeaders: { "md-api-key": config.apiKey },
      ...(config.fetchImpl !== undefined ? { fetch: config.fetchImpl } : {}),
    });
    this.now = config.now ?? Date.now;
  }

  /**
   * GET read via the shared client. Validated as a JSON object (rejects an HTML
   * error page / null) and retried on transient 5xx (idempotent).
   */
  private async get<T>(path: string, context: string): Promise<T> {
    try {
      return await this.client.request<T>({
        method: "GET",
        path,
        schema: objectSchema<T>(context),
      });
    } catch (err) {
      throw mapOffRampError(err, `manteca GET ${path}`, MANTECA_ERROR_CTORS);
    }
  }

  /**
   * POST via the shared client. IRREVERSIBLE money POSTs are NOT marked
   * idempotent (default), so the client never auto-retries them.
   */
  private async post<T>(path: string, body: unknown, context: string): Promise<T> {
    try {
      return await this.client.request<T>({
        method: "POST",
        path,
        body,
        schema: objectSchema<T>(context),
      });
    } catch (err) {
      throw mapOffRampError(err, `manteca POST ${path}`, MANTECA_ERROR_CTORS);
    }
  }

  /** Quote a USDC->ARS off-ramp using the direct sell-side price. */
  async quote(amountUsd: Usd): Promise<OffRampQuote> {
    const body = await this.get<unknown>(
      `/v2/prices/direct/${encodeURIComponent(this.ticker)}`,
      "manteca price",
    );
    const rate = parseDirectPrice(body, this.ticker);
    if (rate === undefined || rate <= 0) {
      throw new MantecaApiError(
        `manteca: could not parse a sell price for ${this.ticker}`,
        200,
        body,
      );
    }
    // Manteca's price already includes its spread; we report spread: 0 and the
    // executable rate. The just-in-time planner accounts for slippage via its
    // own safety multiple.
    return { amountUsd, arsOut: amountUsd * rate, rate, spread: 0 };
  }

  /**
   * Fire the off-ramp synthetic: sell `amountUsd` of crypto and withdraw the ARS
   * to the configured CVU. IRREVERSIBLE — gate behind requireConfirmation (RFC-001)
   * and write to the signed audit log. Returns immediately with the synthetic id;
   * the ARS settles asynchronously (poll getStatus). `arsReceived` is the EXPECTED
   * amount at submission (from a fresh quote); the settled figure comes from getStatus.
   */
  async convert(
    amountUsd: Usd,
    opts: { externalId: string },
  ): Promise<OffRampReceipt> {
    if (!opts?.externalId)
      throw new Error("MantecaOffRampAdapter.convert: externalId (idempotency key) is required");
    const q = await this.quote(amountUsd);
    const externalId = opts.externalId;
    // IRREVERSIBLE money call: routed through post() which never marks the
    // request idempotent, so the core client never auto-retries it even on a
    // timeout — a duplicate synthetic would be a double-sale.
    const synthetic = await this.post<{ id?: string; _id?: string }>(
      "/v2/synthetics/ramp-off",
      {
        userId: this.config.userId,
        sellAmount: String(amountUsd),
        sellAsset: this.sellAsset,
        withdrawAsset: this.fiatAsset,
        bankAccountId: this.config.bankAccountId,
        externalId,
      },
      "manteca ramp-off",
    );
    const txId = synthetic.id ?? synthetic._id;
    if (!txId) {
      throw new MantecaApiError(
        "manteca ramp-off: response had no synthetic id",
        200,
        synthetic,
      );
    }
    return { amountUsd, arsReceived: q.arsOut, rate: q.rate, txId };
  }

  /** Poll a ramp-off synthetic and normalize its settlement state. */
  async getStatus(txId: string): Promise<OffRampStatusReport> {
    const body = await this.get<Record<string, unknown>>(
      `/v2/synthetics/${encodeURIComponent(txId)}`,
      "manteca synthetic status",
    );
    const rawStatus =
      (typeof body.status === "string" && body.status) ||
      (typeof body.state === "string" && body.state) ||
      undefined;
    const arsSettled =
      num(body.withdrawAmount) ??
      num(body.fiatAmount) ??
      num(body.arsAmount) ??
      undefined;
    const report: OffRampStatusReport = {
      txId,
      status: normalizeMantecaStatus(rawStatus),
    };
    if (rawStatus !== undefined) report.raw = rawStatus;
    if (arsSettled !== undefined) report.arsSettled = arsSettled as Ars;
    return report;
  }

  /**
   * One-time onboarding helper: register the society's CBU/CVU/alias as a payout
   * destination. The Manteca user must have `legalId` set first. Returns the
   * created account id to use as `bankAccountId`.
   */
  async registerBankAccount(input: {
    cbuOrCvuOrAlias: string;
    label?: string;
  }): Promise<{ bankAccountId: string; raw: unknown }> {
    const body = await this.post<Record<string, unknown>>(
      "/v2/onboarding-actions/add-bank-account",
      {
        userId: this.config.userId,
        accountNumber: input.cbuOrCvuOrAlias,
        description: input.label ?? "Sociedad Automatizada CVU",
      },
      "manteca add-bank-account",
    );
    const id =
      (typeof body.id === "string" && body.id) ||
      (typeof body._id === "string" && body._id) ||
      (typeof body.bankAccountId === "string" && body.bankAccountId) ||
      "";
    return { bankAccountId: id, raw: body };
  }
}
