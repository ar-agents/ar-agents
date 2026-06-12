/**
 * Buyer side of x402: a fetch wrapper that pays on HTTP 402, plus a
 * facilitator client for callers that talk to a facilitator directly.
 *
 * Flow (spec section 2 + transports-v1/http.md):
 *   1. fetch(url) as-is
 *   2. on 402, parse the PaymentRequiredBody, pick a requirement
 *   3. call the pluggable signer (wallet stays OUTSIDE this package)
 *   4. retry with X-PAYMENT: base64(JSON PaymentPayload)
 *   5. return the response + the decoded X-PAYMENT-RESPONSE settlement
 */
import {
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  paymentRequiredBodySchema,
  settlementResponseSchema,
  verifyResponseSchema,
  settleResponseSchema,
  supportedKindsSchema,
  type PaymentRequiredBody,
  type PaymentRequirements,
  type PaymentPayload,
  type SettlementResponse,
  type VerifyResponse,
  type SettleResponse,
  type SupportedKinds,
  type X402Signer,
} from "./types";
import { encodeBase64Json, decodeBase64Json } from "./encoding";
import {
  X402FacilitatorError,
  X402PaymentRejectedError,
  X402ProtocolError,
  X402UnconfiguredError,
} from "./errors";

export interface X402FetchOptions {
  /**
   * Produces the signed PaymentPayload. Required to actually pay.
   * Omit it and x402Fetch throws X402UnconfiguredError when it hits a 402.
   */
  signer?: X402Signer;
  /**
   * Picks which entry of `accepts` to pay. Default: the first entry.
   * Return undefined to refuse all offered methods (throws
   * X402PaymentRejectedError without paying).
   */
  selectRequirements?: (
    accepts: PaymentRequirements[],
  ) => PaymentRequirements | undefined;
  /**
   * Optional pre-payment gate. Called AFTER requirements are known and
   * BEFORE the signer runs. Return false to abort without paying
   * (x402Fetch throws X402PaymentRejectedError). Wire this to a human
   * confirmation flow for agents that must not spend autonomously.
   */
  onPayment?: (requirements: PaymentRequirements) => Promise<boolean>;
  /** fetch implementation override (tests / custom transports). */
  fetch?: typeof globalThis.fetch;
}

export interface X402FetchResult {
  /** The final Response (post-payment when a payment happened). */
  response: Response;
  /** True when a 402 round-trip + payment occurred. */
  paid: boolean;
  /** The requirements that were paid, when paid. */
  requirements?: PaymentRequirements;
  /** Decoded X-PAYMENT-RESPONSE settlement, when the server sent one. */
  settlement?: SettlementResponse;
}

/** Parse + validate a 402 response body into PaymentRequiredBody. */
export async function parsePaymentRequired(
  response: Response,
): Promise<PaymentRequiredBody> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (cause) {
    throw new X402ProtocolError(
      "402 response body is not valid JSON.",
      cause,
    );
  }
  const parsed = paymentRequiredBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new X402ProtocolError(
      "402 response body does not match the x402 PaymentRequiredBody schema.",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

/** Decode + validate an X-PAYMENT-RESPONSE header, if present. */
export function decodeSettlementHeader(
  response: Response,
): SettlementResponse | undefined {
  const header = response.headers.get(X_PAYMENT_RESPONSE_HEADER);
  if (!header) return undefined;
  let raw: unknown;
  try {
    raw = decodeBase64Json(header);
  } catch (cause) {
    throw new X402ProtocolError(
      `${X_PAYMENT_RESPONSE_HEADER} header is not valid base64 JSON.`,
      cause,
    );
  }
  const parsed = settlementResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new X402ProtocolError(
      `${X_PAYMENT_RESPONSE_HEADER} header does not match the SettlementResponse schema.`,
      parsed.error.issues,
    );
  }
  return parsed.data;
}

/** Encode a PaymentPayload into the X-PAYMENT header value. */
export function encodePaymentHeader(payload: PaymentPayload): string {
  return encodeBase64Json(payload);
}

/**
 * fetch that pays on 402. Non-402 responses pass through untouched.
 * Throws:
 *  - X402UnconfiguredError when a 402 arrives and no signer is wired
 *  - X402ProtocolError on malformed 402 bodies / settlement headers
 *  - X402PaymentRejectedError when payment was declined by the gate,
 *    no requirement was selected, or the retry still returned 402
 */
export async function x402Fetch(
  url: string | URL,
  init: RequestInit = {},
  opts: X402FetchOptions = {},
): Promise<X402FetchResult> {
  const doFetch = opts.fetch ?? globalThis.fetch;

  const first = await doFetch(url, init);
  if (first.status !== 402) {
    return { response: first, paid: false };
  }

  const body = await parsePaymentRequired(first);
  const select = opts.selectRequirements ?? ((a: PaymentRequirements[]) => a[0]);
  const requirements = select(body.accepts);
  if (!requirements) {
    throw new X402PaymentRejectedError(
      "No acceptable payment requirements selected from the 402 `accepts` array.",
      body.accepts,
    );
  }

  if (!opts.signer) {
    throw new X402UnconfiguredError("x402Fetch");
  }

  if (opts.onPayment) {
    const approved = await opts.onPayment(requirements);
    if (!approved) {
      throw new X402PaymentRejectedError(
        "Payment declined by the onPayment confirmation gate.",
        requirements,
      );
    }
  }

  const payload = await opts.signer(requirements);

  const headers = new Headers(init.headers);
  headers.set(X_PAYMENT_HEADER, encodePaymentHeader(payload));
  const second = await doFetch(url, { ...init, headers });

  const settlement = decodeSettlementHeader(second);

  if (second.status === 402) {
    throw new X402PaymentRejectedError(
      `Resource still returned 402 after attaching ${X_PAYMENT_HEADER}.` +
        (settlement?.errorReason ? ` Reason: ${settlement.errorReason}.` : ""),
      settlement,
    );
  }

  return {
    response: second,
    paid: true,
    requirements,
    ...(settlement !== undefined ? { settlement } : {}),
  };
}

/**
 * Probe a URL's payment requirements WITHOUT paying. Returns null when
 * the resource does not require payment (non-402 status).
 */
export async function probePaymentRequirements(
  url: string | URL,
  init: RequestInit = {},
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<PaymentRequiredBody | null> {
  const res = await fetchImpl(url, init);
  if (res.status !== 402) return null;
  return parsePaymentRequired(res);
}

// ── Facilitator client (spec section 7) ─────────────────────────────

export interface FacilitatorClientOptions {
  /** e.g. "https://x402.org/facilitator" (no trailing slash needed). */
  baseUrl: string;
  /** Extra headers (auth for private facilitators). */
  headers?: Record<string, string>;
  /** fetch implementation override (tests). */
  fetch?: typeof globalThis.fetch;
}

export class FacilitatorClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(opts: FacilitatorClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.headers = opts.headers ?? {};
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => undefined);
    if (!res.ok) throw new X402FacilitatorError(res.status, json);
    return json;
  }

  /** POST /verify: validate a payment authorization off-chain. */
  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const json = await this.post("/verify", {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements,
    });
    const parsed = verifyResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new X402ProtocolError(
        "Facilitator /verify response does not match the VerifyResponse schema.",
        parsed.error.issues,
      );
    }
    return parsed.data;
  }

  /** POST /settle: broadcast the payment on-chain. */
  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const json = await this.post("/settle", {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements,
    });
    const parsed = settleResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new X402ProtocolError(
        "Facilitator /settle response does not match the SettleResponse schema.",
        parsed.error.issues,
      );
    }
    return parsed.data;
  }

  /** GET /supported: list scheme + network pairs the facilitator handles. */
  async supported(): Promise<SupportedKinds> {
    const res = await this.fetchImpl(`${this.baseUrl}/supported`, {
      headers: this.headers,
    });
    const json = await res.json().catch(() => undefined);
    if (!res.ok) throw new X402FacilitatorError(res.status, json);
    const parsed = supportedKindsSchema.safeParse(json);
    if (!parsed.success) {
      throw new X402ProtocolError(
        "Facilitator /supported response does not match the SupportedKinds schema.",
        parsed.error.issues,
      );
    }
    return parsed.data;
  }
}
