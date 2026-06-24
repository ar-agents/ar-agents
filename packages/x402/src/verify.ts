/**
 * Local verification of an x402 `exact` (EIP-3009) payment. This is the real
 * crypto: recover the EIP-712 signer and check every parameter against the
 * requirements, so the resource server can verify WITHOUT trusting a facilitator
 * for the signature check. On-chain settlement still goes through a facilitator
 * (facilitator.ts); balance is read via an injected function (decoupled + mockable).
 *
 * Every failure maps to an x402 ErrorReason.
 */

import { getAddress, recoverTypedDataAddress } from "viem";
import {
  EIP3009_PRIMARY_TYPE,
  EIP3009_TYPES,
  isSupportedNetwork,
  NETWORKS,
  type ErrorReason,
  type PaymentPayload,
  type PaymentRequirements,
  type SupportedNetwork,
  type VerifyResponse,
} from "./types";

/** Reads the USDC balance (atomic units) of `owner` on `network`. */
export type BalanceReader = (args: {
  network: SupportedNetwork;
  asset: `0x${string}`;
  owner: `0x${string}`;
}) => Promise<bigint>;

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Build a BalanceReader from any viem-style public client (anything with a
 * `readContract`). Use it to turn on the on-chain `insufficient_funds` check.
 */
export function createErc20BalanceReader(client: {
  readContract: (args: {
    address: `0x${string}`;
    abi: typeof ERC20_BALANCE_ABI;
    functionName: "balanceOf";
    args: [`0x${string}`];
  }) => Promise<bigint>;
}): BalanceReader {
  return async ({ asset, owner }) =>
    client.readContract({
      address: asset,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [owner],
    });
}

export interface VerifyOptions {
  /** Injectable clock (ms). Default Date.now. */
  now?: () => number;
  /**
   * Optional balance check. If provided, the payer's USDC balance must cover the
   * authorized value, else `insufficient_funds`. Omit to skip the on-chain read.
   */
  balanceReader?: BalanceReader;
}

const fail = (invalidReason: ErrorReason): VerifyResponse => ({ isValid: false, invalidReason });

function sameAddr(a: string, b: string): boolean {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

/**
 * Verify a decoded PaymentPayload against the PaymentRequirements it claims to
 * satisfy. Pure except for the optional balance read. Does NOT settle.
 */
export async function verifyPayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  opts: VerifyOptions = {},
): Promise<VerifyResponse> {
  if (payload.x402Version !== 1) return fail("invalid_x402_version");
  if (payload.scheme !== "exact" || requirements.scheme !== "exact")
    return fail("unsupported_scheme");
  if (payload.network !== requirements.network) return fail("invalid_network");
  if (!isSupportedNetwork(payload.network)) return fail("invalid_network");

  const net = NETWORKS[payload.network];
  if (!sameAddr(requirements.asset, net.usdc)) return fail("invalid_payment_requirements");

  const auth = payload.payload.authorization;
  if (!sameAddr(auth.to, requirements.payTo))
    return fail("invalid_exact_evm_payload_recipient_mismatch");

  let value: bigint;
  let required: bigint;
  let validAfter: bigint;
  let validBefore: bigint;
  try {
    value = BigInt(auth.value);
    required = BigInt(requirements.maxAmountRequired);
    validAfter = BigInt(auth.validAfter);
    validBefore = BigInt(auth.validBefore);
  } catch {
    return fail("invalid_payload");
  }
  if (value < required) return fail("invalid_exact_evm_payload_authorization_value");

  const nowSec = BigInt(Math.floor((opts.now ?? Date.now)() / 1000));
  if (nowSec < validAfter) return fail("invalid_exact_evm_payload_authorization_valid_after");
  if (nowSec > validBefore) return fail("payment_expired");

  // EIP-712 signature recovery against the USDC domain for this network.
  const domain = {
    name: requirements.extra?.name ?? net.usdcName,
    version: requirements.extra?.version ?? net.usdcVersion,
    chainId: net.chainId,
    verifyingContract: getAddress(requirements.asset),
  } as const;
  const message = {
    from: getAddress(auth.from),
    to: getAddress(auth.to),
    value,
    validAfter,
    validBefore,
    nonce: auth.nonce as `0x${string}`,
  };
  let recovered: string;
  try {
    recovered = await recoverTypedDataAddress({
      domain,
      types: EIP3009_TYPES,
      primaryType: EIP3009_PRIMARY_TYPE,
      message,
      signature: payload.payload.signature as `0x${string}`,
    });
  } catch {
    return fail("invalid_exact_evm_payload_signature");
  }
  if (!sameAddr(recovered, auth.from)) return fail("invalid_exact_evm_payload_signature");

  if (opts.balanceReader) {
    try {
      const bal = await opts.balanceReader({
        network: payload.network,
        asset: getAddress(requirements.asset),
        owner: getAddress(auth.from),
      });
      if (bal < value) return fail("insufficient_funds");
    } catch {
      return fail("unexpected_verify_error");
    }
  }

  return { isValid: true, payer: getAddress(auth.from) };
}
