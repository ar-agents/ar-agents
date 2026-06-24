/**
 * Facilitator clients. A facilitator does the chain-touching work (verify a
 * signature + balance, then broadcast the EIP-3009 transfer and confirm it) so
 * the resource server holds no keys and runs no node.
 *
 *   POST /verify    {x402Version, paymentPayload, paymentRequirements} -> VerifyResponse
 *   POST /settle    (same body)                                        -> SettleResponse
 *   GET  /supported                                                    -> { kinds: [{scheme,network}] }
 *
 * - HostedFacilitatorClient: the real thing. Default = the free x402.org testnet
 *   facilitator (Base Sepolia, no key). Pass the CDP URL + createAuthHeaders for
 *   Base mainnet.
 * - InMemoryFacilitator: no network. Runs the real local verify (verify.ts) and
 *   returns a deterministic synthetic settlement, with EIP-3009 nonce replay
 *   protection. For tests + local dev.
 */

import { verifyPayment, type VerifyOptions } from "./verify";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "./types";

export interface SupportedKind {
  scheme: string;
  network: string;
}

export interface Facilitator {
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
  supported?(): Promise<SupportedKind[]>;
}

/** Free testnet facilitator (Base Sepolia + Solana devnet), no API key. */
export const X402_TESTNET_FACILITATOR = "https://x402.org/facilitator";
/** Coinbase CDP facilitator for mainnet (Base etc.); needs CDP credentials. */
export const CDP_MAINNET_FACILITATOR = "https://api.cdp.coinbase.com/platform/v2/x402";

export interface HostedFacilitatorConfig {
  /** Facilitator base URL. Default = the x402.org testnet facilitator. */
  url?: string;
  /** Per-call auth headers (CDP mainnet needs these). */
  createAuthHeaders?: () => Promise<{
    verify?: Record<string, string>;
    settle?: Record<string, string>;
  }>;
  /** Injectable fetch (tests / non-global-fetch runtimes). */
  fetchImpl?: typeof fetch;
}

export class HostedFacilitatorClient implements Facilitator {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly config: HostedFacilitatorConfig = {}) {
    this.url = (config.url ?? X402_TESTNET_FACILITATOR).replace(/\/+$/, "");
    const f = config.fetchImpl ?? globalThis.fetch;
    if (!f) throw new Error("no fetch available; pass HostedFacilitatorConfig.fetchImpl");
    this.fetchImpl = f;
  }

  private async post(path: "/verify" | "/settle", body: unknown, headers?: Record<string, string>) {
    const res = await this.fetchImpl(`${this.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text; // non-JSON error body; callers map !ok to unexpected_*
      }
    }
    return { ok: res.ok, status: res.status, parsed };
  }

  async verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    const auth = await this.config.createAuthHeaders?.();
    const { ok, parsed } = await this.post(
      "/verify",
      { x402Version: 1, paymentPayload: payload, paymentRequirements: requirements },
      auth?.verify,
    );
    if (!ok) return { isValid: false, invalidReason: "unexpected_verify_error" };
    return parsed as VerifyResponse;
  }

  async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    const auth = await this.config.createAuthHeaders?.();
    const { ok, parsed } = await this.post(
      "/settle",
      { x402Version: 1, paymentPayload: payload, paymentRequirements: requirements },
      auth?.settle,
    );
    if (!ok) {
      return {
        success: false,
        transaction: "",
        network: payload.network,
        error: "unexpected_settle_error",
      };
    }
    return parsed as SettleResponse;
  }

  async supported(): Promise<SupportedKind[]> {
    const res = await this.fetchImpl(`${this.url}/supported`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { kinds?: SupportedKind[] };
    return body.kinds ?? [];
  }
}

/**
 * In-memory facilitator: real local verify + deterministic synthetic settlement.
 * The synthetic tx hash is derived from the EIP-3009 nonce (unique per payment);
 * a replayed nonce settles to `duplicate_settlement`, mirroring on-chain
 * AuthorizationUsed. For tests + offline dev only.
 */
export class InMemoryFacilitator implements Facilitator {
  private readonly used = new Set<string>();
  constructor(private readonly opts: VerifyOptions = {}) {}

  async verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    return verifyPayment(payload, requirements, this.opts);
  }

  async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    const v = await this.verify(payload, requirements);
    if (!v.isValid) {
      return {
        success: false,
        transaction: "",
        network: payload.network,
        error: v.invalidReason ?? "unexpected_settle_error",
      };
    }
    const nonce = payload.payload.authorization.nonce;
    if (this.used.has(nonce)) {
      return {
        success: false,
        transaction: "",
        network: payload.network,
        error: "duplicate_settlement",
      };
    }
    this.used.add(nonce);
    return { success: true, transaction: nonce, network: payload.network, payer: v.payer };
  }

  async supported(): Promise<SupportedKind[]> {
    return [
      { scheme: "exact", network: "base" },
      { scheme: "exact", network: "base-sepolia" },
    ];
  }
}
