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

import type {
  Ars,
  OffRampAdapter,
  OffRampQuote,
  OffRampReceipt,
  OffRampStatus,
  OffRampStatusReport,
  Usd,
} from "./index";

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

export class MantecaOffRampAdapter implements OffRampAdapter {
  private readonly baseUrl: string;
  private readonly sellAsset: string;
  private readonly fiatAsset: string;
  private readonly ticker: string;
  private readonly fetchImpl: typeof fetch;
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
    const f = config.fetchImpl ?? globalThis.fetch;
    if (!f) throw new Error("no fetch available; pass MantecaConfig.fetchImpl");
    this.fetchImpl = f;
    this.now = config.now ?? Date.now;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        "md-api-key": this.config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      throw new MantecaApiError(
        `manteca ${method} ${path} transport error: ${String(cause)}`,
        0,
      );
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
      const msg = `manteca ${method} ${path} -> ${res.status}`;
      if (res.status === 401 || res.status === 403)
        throw new MantecaAuthError(msg, res.status, parsed);
      if (res.status === 429)
        throw new MantecaRateLimitError(msg, res.status, parsed);
      throw new MantecaApiError(msg, res.status, parsed);
    }
    return parsed as T;
  }

  /** Quote a USDC->ARS off-ramp using the direct sell-side price. */
  async quote(amountUsd: Usd): Promise<OffRampQuote> {
    const body = await this.request<unknown>(
      "GET",
      `/v2/prices/direct/${encodeURIComponent(this.ticker)}`,
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
    opts?: { externalId?: string },
  ): Promise<OffRampReceipt> {
    const q = await this.quote(amountUsd);
    const externalId =
      opts?.externalId ?? `rampoff-${this.config.userId}-${this.now()}`;
    const synthetic = await this.request<{ id?: string; _id?: string }>(
      "POST",
      "/v2/synthetics/ramp-off",
      {
        userId: this.config.userId,
        sellAmount: String(amountUsd),
        sellAsset: this.sellAsset,
        withdrawAsset: this.fiatAsset,
        bankAccountId: this.config.bankAccountId,
        externalId,
      },
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
    const body = await this.request<Record<string, unknown>>(
      "GET",
      `/v2/synthetics/${encodeURIComponent(txId)}`,
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
    const body = await this.request<Record<string, unknown>>(
      "POST",
      "/v2/onboarding-actions/add-bank-account",
      {
        userId: this.config.userId,
        accountNumber: input.cbuOrCvuOrAlias,
        description: input.label ?? "Sociedad Automatizada CVU",
      },
    );
    const id =
      (typeof body.id === "string" && body.id) ||
      (typeof body._id === "string" && body._id) ||
      (typeof body.bankAccountId === "string" && body.bankAccountId) ||
      "";
    return { bankAccountId: id, raw: body };
  }
}
