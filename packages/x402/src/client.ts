/**
 * Client side: sign an x402 `exact` (EIP-3009) payment. Useful both for paying
 * other resources and for exercising the receiver in tests with REAL signatures.
 */

import { getAddress, type LocalAccount } from "viem";
import {
  EIP3009_PRIMARY_TYPE,
  EIP3009_TYPES,
  isSupportedNetwork,
  NETWORKS,
  type PaymentPayload,
  type PaymentRequirements,
} from "./types";

/** Random 32-byte nonce (edge-safe via global crypto). */
export function randomNonce(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

export interface SignPaymentArgs {
  /** A viem LocalAccount (e.g. privateKeyToAccount) that pays. */
  account: LocalAccount;
  requirements: PaymentRequirements;
  /** Injectable clock (ms). Default Date.now. */
  now?: () => number;
  /** Authorization validity window, seconds. Default = requirements.maxTimeoutSeconds. */
  validitySeconds?: number;
  /** Override the nonce (tests). Default random. */
  nonce?: `0x${string}`;
}

/**
 * Sign an EIP-3009 transferWithAuthorization for the given requirements and pack
 * it into an x402 v1 PaymentPayload (ready for encodePaymentHeader).
 */
export async function signExactPayment(args: SignPaymentArgs): Promise<PaymentPayload> {
  const { account, requirements } = args;
  if (!isSupportedNetwork(requirements.network)) {
    throw new Error(`unsupported network: ${requirements.network}`);
  }
  const net = NETWORKS[requirements.network];
  const nowSec = Math.floor((args.now ?? Date.now)() / 1000);
  const window = args.validitySeconds ?? requirements.maxTimeoutSeconds;
  // small backdate so a tiny client/server clock skew doesn't fail validAfter.
  const validAfter = String(nowSec - 5);
  const validBefore = String(nowSec + window);
  const nonce = args.nonce ?? randomNonce();
  const from = getAddress(account.address);
  const to = getAddress(requirements.payTo);

  const domain = {
    name: requirements.extra?.name ?? net.usdcName,
    version: requirements.extra?.version ?? net.usdcVersion,
    chainId: net.chainId,
    verifyingContract: getAddress(requirements.asset),
  } as const;

  const signature = await account.signTypedData({
    domain,
    types: EIP3009_TYPES,
    primaryType: EIP3009_PRIMARY_TYPE,
    message: {
      from,
      to,
      value: BigInt(requirements.maxAmountRequired),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
    },
  });

  return {
    x402Version: 1,
    scheme: "exact",
    network: requirements.network,
    payload: {
      signature,
      authorization: { from, to, value: requirements.maxAmountRequired, validAfter, validBefore, nonce },
    },
  };
}
