/**
 * X402Receiver — the ergonomic intake surface a Sociedad Automatizada uses to
 * charge USDC for its resources (an API route, an MCP tool call, etc.).
 *
 *   1. No payment yet?  -> receiver.paymentRequired(price)  => 402 + body
 *   2. X-PAYMENT header present? -> receiver.process(header, requirements)
 *        => decode -> verify (local EIP-712) -> settle (facilitator)
 *        => { ok, receipt, settlementHeader }
 *
 * The `X402Receipt.amountUsdc` is the rail-1 -> rail-2 bridge: add it to the
 * treasury's USDC balance (@ar-agents/treasury) once settled.
 */

import {
  X_PAYMENT_RESPONSE_HEADER,
  decodePaymentHeader,
  encodeSettlementHeader,
} from "./codec";
import { verifyPayment, type BalanceReader } from "./verify";
import type { Facilitator } from "./facilitator";
import {
  NETWORKS,
  atomicToUsdc,
  usdcToAtomic,
  type PaymentRequirements,
  type ReasonText,
  type PaymentRequirementsResponse,
  type SettleResponse,
  type SupportedNetwork,
} from "./types";

export interface ResourcePrice {
  /** Price in USDC (e.g. 0.01). Converted to atomic units internally. */
  usdc: number;
  network: SupportedNetwork;
  /** The society's receiving address. */
  payTo: `0x${string}`;
  /** The resource being paid for (its URL/identifier). */
  resource: string;
  description?: string;
  mimeType?: string;
  /** Payment authorization window, seconds. Default 60. */
  maxTimeoutSeconds?: number;
  /** ERC-20 asset. Defaults to USDC for the network. */
  asset?: `0x${string}`;
}

/** Build a single PaymentRequirements (one entry of the 402 `accepts` array). */
export function buildPaymentRequirements(price: ResourcePrice): PaymentRequirements {
  const net = NETWORKS[price.network];
  return {
    scheme: "exact",
    network: price.network,
    maxAmountRequired: usdcToAtomic(price.usdc),
    resource: price.resource,
    description: price.description ?? "",
    mimeType: price.mimeType ?? "application/json",
    payTo: price.payTo,
    maxTimeoutSeconds: price.maxTimeoutSeconds ?? 60,
    asset: price.asset ?? net.usdc,
    extra: { name: net.usdcName, version: net.usdcVersion },
  };
}

/** Build the full 402 response body for one or more acceptable prices. */
export function build402Body(
  prices: ResourcePrice | ResourcePrice[],
  error = "X-PAYMENT header is required",
): PaymentRequirementsResponse {
  const list = Array.isArray(prices) ? prices : [prices];
  return { x402Version: 1, error, accepts: list.map(buildPaymentRequirements) };
}

/** A settled payment, normalized for the treasury bridge. */
export interface X402Receipt {
  /** Human USDC amount (atomic / 1e6). Add this to TreasuryState.usd. */
  amountUsdc: number;
  amountAtomic: string;
  payer: string;
  network: string;
  /** On-chain settlement tx hash. */
  txId: string;
  resource: string;
}

export type X402Result =
  | {
      ok: true;
      receipt: X402Receipt;
      settlement: SettleResponse;
      /** Set this response header so the client sees the settlement. */
      headerName: string;
      headerValue: string;
    }
  | { ok: false; reason: ReasonText };

export interface X402ReceiverConfig {
  facilitator: Facilitator;
  /** Verify the EIP-712 signature locally before settling. Default true. */
  localVerify?: boolean;
  /** Injectable clock (ms). Default Date.now. */
  now?: () => number;
  /** Optional on-chain balance check during local verify. */
  balanceReader?: BalanceReader;
}

export class X402Receiver {
  constructor(private readonly config: X402ReceiverConfig) {}

  requirements(price: ResourcePrice): PaymentRequirements {
    return buildPaymentRequirements(price);
  }

  /** The 402 to return when the client has not paid yet. */
  paymentRequired(
    prices: ResourcePrice | ResourcePrice[],
    error?: string,
  ): { status: 402; body: PaymentRequirementsResponse } {
    return { status: 402, body: build402Body(prices, error) };
  }

  /**
   * Process an incoming X-PAYMENT header against the requirements it must satisfy.
   * Decodes, verifies (locally by default), settles via the facilitator, and on
   * success returns a normalized receipt + the X-PAYMENT-RESPONSE header to set.
   */
  async process(
    xPaymentHeader: string | null | undefined,
    requirements: PaymentRequirements,
  ): Promise<X402Result> {
    if (!xPaymentHeader) return { ok: false, reason: "invalid_payload" };

    let payload;
    try {
      payload = decodePaymentHeader(xPaymentHeader);
    } catch {
      return { ok: false, reason: "invalid_payload" };
    }

    const localVerify = this.config.localVerify ?? true;
    const verifyOpts = {
      ...(this.config.now ? { now: this.config.now } : {}),
      ...(this.config.balanceReader ? { balanceReader: this.config.balanceReader } : {}),
    };
    const v = localVerify
      ? await verifyPayment(payload, requirements, verifyOpts)
      : await this.config.facilitator.verify(payload, requirements);
    if (!v.isValid) return { ok: false, reason: v.invalidReason ?? "unexpected_verify_error" };

    const settlement = await this.config.facilitator.settle(payload, requirements);
    if (!settlement.success) {
      return { ok: false, reason: settlement.error ?? "unexpected_settle_error" };
    }

    const amountAtomic = payload.payload.authorization.value;
    const receipt: X402Receipt = {
      amountUsdc: atomicToUsdc(amountAtomic),
      amountAtomic,
      payer: settlement.payer ?? v.payer ?? payload.payload.authorization.from,
      network: settlement.network,
      txId: settlement.transaction,
      resource: requirements.resource,
    };
    return {
      ok: true,
      receipt,
      settlement,
      headerName: X_PAYMENT_RESPONSE_HEADER,
      headerValue: encodeSettlementHeader(settlement),
    };
  }
}
