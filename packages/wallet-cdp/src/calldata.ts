/**
 * The ERC-20 `transfer(address,uint256)` calldata, encoded and decoded exactly.
 *
 * Why this file exists (ROADMAP.md M2-4a's finding, M2-4b's fix): for an
 * ERC-20 USDC transfer the transaction's `to` field is the USDC CONTRACT
 * address, not the recipient -- the real recipient is the FIRST argument
 * inside the `transfer` call's calldata. Coinbase CDP's `evmAddress` policy
 * criterion only ever looks at the transaction's `to`, so it cannot tell a
 * good USDC recipient from a bad one (see docs/research/spikes/wallet-provider/
 * COMPARISON.md). Closing that gap requires a policy that decodes the
 * calldata -- CDP calls this criterion `evmData` (see ./policy.ts) -- and this
 * module is the ground truth for exactly what bytes that decode is looking
 * at: a 4-byte function selector, then the recipient right-aligned in a
 * 32-byte slot, then the amount right-aligned in a 32-byte slot.
 *
 * Built on `viem` (already a transitive dependency of `@coinbase/cdp-sdk`)
 * rather than hand-rolled hex math, so the encoding itself is not something
 * this package has to get right from scratch.
 */

import { decodeFunctionData, encodeFunctionData, getAddress, isAddress } from "viem";
import { ArAgentsValidationError } from "@ar-agents/core";

/** Minimal ABI fragment for `transfer(address,uint256) returns (bool)`. */
export const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * The well-known 4-byte function selector for `transfer(address,uint256)`
 * (the first 4 bytes of `keccak256("transfer(address,uint256)")`). This is a
 * public, unchanging constant of the ERC-20 standard -- verifiable against
 * any EVM tooling's 4-byte signature database (e.g. https://www.4byte.directory
 * /signatures/?bytes4_signature=0xa9059cbb) -- not something specific to CDP
 * or this package.
 */
export const ERC20_TRANSFER_SELECTOR = "0xa9059cbb" as const;

function assertHexAddress(value: string, field: string): `0x${string}` {
  if (!isAddress(value)) {
    throw new ArAgentsValidationError(field, `not a valid EVM address: ${value}`);
  }
  return getAddress(value);
}

function assertNonNegativeAtomic(value: bigint, field: string): void {
  if (value < 0n) {
    throw new ArAgentsValidationError(field, `must be >= 0, got ${value}`);
  }
  // uint256 max -- guards against a caller accidentally passing a signed/
  // negative-wrapped or otherwise out-of-range value through as a bigint.
  const UINT256_MAX = 2n ** 256n - 1n;
  if (value > UINT256_MAX) {
    throw new ArAgentsValidationError(field, `exceeds uint256 max, got ${value}`);
  }
}

/**
 * Encode the exact calldata for `transfer(to, amountAtomic)`: selector +
 * recipient (32-byte slot) + amount (32-byte slot). `amountAtomic` is base
 * units (USDC has 6 decimals: "1000000" atomic == 1.0 USDC).
 */
export function encodeErc20TransferCalldata(to: string, amountAtomic: bigint): `0x${string}` {
  const recipient = assertHexAddress(to, "to");
  assertNonNegativeAtomic(amountAtomic, "amountAtomic");
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [recipient, amountAtomic],
  });
}

/** Decode a `transfer` calldata back into `{ to, amountAtomic }`. Inverse of the above. */
export function decodeErc20TransferCalldata(data: `0x${string}`): { to: `0x${string}`; amountAtomic: bigint } {
  const { functionName, args } = decodeFunctionData({ abi: ERC20_TRANSFER_ABI, data });
  if (functionName !== "transfer") {
    throw new ArAgentsValidationError("data", `expected a transfer() call, decoded "${functionName}"`);
  }
  const [to, amountAtomic] = args;
  return { to, amountAtomic };
}
