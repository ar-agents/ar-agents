/**
 * Build a Coinbase CDP spend policy for a society's USDC wallet, at the
 * CALLDATA level -- the ROADMAP.md M2-4a finding this milestone (M2-4b) fixes.
 *
 * GROUNDING: CDP's policy engine is server-side (evaluated before signing;
 * confirmed live on Base Sepolia by docs/research/spikes/wallet-provider/
 * coinbase-spike.mjs -- a violating transfer came back rejected with "The
 * request is forbidden due to violating at least one configured policy.").
 * Its documented EVM criteria (docs.cdp.coinbase.com/server-wallets/v2/
 * using-the-wallet-api/policies/evm-policies, fetched 2026-07-12) include:
 *
 *   - `evmAddress`: matches the transaction's `to` field against an allowlist.
 *     For a native ETH send `to` IS the recipient; for an ERC-20 call `to` is
 *     the TOKEN CONTRACT -- the actual recipient is inside the calldata. This
 *     is exactly the gap COMPARISON.md flagged: an evmAddress allowlist alone
 *     cannot tell a good USDC recipient from a bad one, since both go to the
 *     same contract address.
 *   - `evmData`: decodes the transaction's calldata against a named or custom
 *     ABI and constrains specific DECODED parameters (e.g. `abi: "erc20"`,
 *     function `"transfer"`, params `to` / `value`). This is the criterion
 *     that closes the gap: it reaches past the contract address and rule on
 *     the actual recipient + amount the calldata encodes (see ./calldata.ts
 *     for the exact bytes this corresponds to: selector + recipient slot +
 *     amount slot).
 *   - `ethValue`: caps native ETH sent alongside a call.
 *
 * GROUND TRUTH, verified against the installed SDK's OWN client-side zod
 * schema (`@coinbase/cdp-sdk/src/policies/evmSchema.ts`, v1.52.0) -- not
 * just documentation prose. Confirmed by running `scripts/wallet-cdp-live-
 * check.mjs` against the real API: the first attempt below used a single
 * `value`/`operator:"in"` shape (reconstructed from doc pages only) and CDP's
 * SDK rejected it client-side with a `ZodError` naming the exact expected
 * shape, which is what this file now builds:
 *
 *   - a numeric/string comparison param is `{ name, operator: "<"|"<="|">"|
 *     ">="|"==", value: string }` (singular `value`) -- `EvmDataParameterConditionSchema`.
 *   - a set-membership param is `{ name, operator: "in"|"not in", values: string[] }`
 *     (PLURAL `values`, a different field name) -- `EvmDataParameterConditionListSchema`.
 *
 * `evmData`'s `abi` field accepts the `"erc20"` shortcut directly (confirmed
 * in the same schema file: `abi: z.union([z.enum(["erc20","erc721","erc1155"]), Abi])`).
 * `evmData` is valid on `sendEvmTransaction` criteria (confirmed in
 * `SendEvmTransactionCriteriaSchema`, which includes `EvmDataCriterionSchema`).
 *
 * FULLY LIVE-PROVEN (2026-07-12, Base Sepolia, real CDP account, real
 * `createPolicy`/`updateAccount` calls -- not a mock): `applySpendPolicy`
 * attached this exact rule shape server-side; a transfer ABOVE the cap to
 * the allowlisted recipient came back rejected with "The request is
 * forbidden due to violating at least one configured policy."
 * (`WalletCdpPolicyDeniedError`), and a transfer AT the cap to the SAME
 * recipient succeeded on-chain (tx
 * 0x9f95e747516c72be2e759279e92a6cbba82e0fa317832eef6c754237ac15fd7f).
 * This is not just "the SDK accepted the shape" -- CDP's server actually
 * enforced the decoded-calldata amount bound. See `scripts/wallet-cdp-live-
 * check.mjs` to reproduce.
 */

import { ArAgentsValidationError } from "@ar-agents/core";
import { getAddress, isAddress } from "viem";

/** One EVM policy rule, in CDP's `policies.createPolicy` shape. */
export interface CdpPolicyRule {
  action: "accept" | "reject";
  operation: "sendEvmTransaction" | "signEvmTransaction";
  criteria: CdpPolicyCriterion[];
}

/** A single-value comparison param, e.g. `{name:"value", operator:"<=", value:"1000000"}`. */
export interface CdpEvmDataScalarParam {
  name: string;
  operator: "<" | "<=" | ">" | ">=" | "==";
  value: string;
}

/** A set-membership param, e.g. `{name:"to", operator:"in", values:[...]}` (PLURAL `values`). */
export interface CdpEvmDataSetParam {
  name: string;
  operator: "in" | "not in";
  values: string[];
}

export type CdpPolicyCriterion =
  | { type: "evmAddress"; addresses: string[]; operator: "in" | "not in" }
  | { type: "ethValue"; ethValue: string; operator: "<=" | "<" | ">" | ">=" | "==" }
  | {
      type: "evmData";
      abi: "erc20" | "erc721" | "erc1155";
      conditions: Array<{
        function: string;
        params: Array<CdpEvmDataScalarParam | CdpEvmDataSetParam>;
      }>;
    };

export interface Erc20SpendPolicyOptions {
  /** The USDC (or other ERC-20) contract address the wallet is allowed to call `transfer` on. */
  usdcContractAddress: string;
  /** Per-transaction cap, in the token's atomic base units (USDC: 6 decimals). */
  maxPerTxAtomic: string;
  /**
   * If set, `transfer`'s recipient (the calldata's decoded `to` argument)
   * must be one of these addresses. Omit to cap the AMOUNT only (any
   * recipient), which is still a real improvement over no policy, but
   * recipient allowlisting is what actually closes the M2-4a gap -- prefer
   * setting this for a production society wallet.
   */
  recipientAllowlist?: string[];
  /**
   * Reject any transaction that also carries native ETH value (`ethValue >
   * 0`), so the ONLY accepted spend path is the allowlisted/capped USDC
   * `transfer` above. Default true. CDP's docs do not state the policy
   * engine's default action for an operation matching no rule once a policy
   * is attached (same ambiguity the spike recorded); this explicit reject
   * rule makes the deny-native-ETH intent unambiguous regardless of that
   * undocumented default.
   */
  denyNativeEth?: boolean;
}

/** CDP policy descriptions must match `^[A-Za-z0-9 ,.]{1,50}$` (undocumented,
 *  found live by the M2-4a spike). Strip anything else and cap the length. */
export function sanitizePolicyDescription(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9 ,.]/g, "").trim();
  // The fallback itself must satisfy the same charset (no hyphen).
  return cleaned.length > 0 ? cleaned.slice(0, 50) : "ar agents wallet spend policy";
}

function assertAddress(value: string, field: string): string {
  if (!isAddress(value)) {
    throw new ArAgentsValidationError(field, `not a valid EVM address: ${value}`);
  }
  return getAddress(value);
}

function assertAtomicAmount(value: string, field: string): string {
  if (!/^\d+$/.test(value)) {
    throw new ArAgentsValidationError(field, `must be a non-negative integer string of atomic units, got "${value}"`);
  }
  return value;
}

/**
 * Build the CDP policy rules enforcing: USDC-only, `transfer()`-only, capped
 * at `maxPerTxAtomic`, optionally recipient-allowlisted, native ETH denied.
 * Pure -- does not call CDP; see `applySpendPolicy` to attach it.
 */
export function buildErc20SpendPolicyRules(opts: Erc20SpendPolicyOptions): CdpPolicyRule[] {
  const usdcContractAddress = assertAddress(opts.usdcContractAddress, "usdcContractAddress");
  const maxPerTxAtomic = assertAtomicAmount(opts.maxPerTxAtomic, "maxPerTxAtomic");
  const recipientAllowlist = opts.recipientAllowlist?.map((a) => assertAddress(a, "recipientAllowlist[]"));

  const amountParam: CdpEvmDataScalarParam = { name: "value", operator: "<=", value: maxPerTxAtomic };
  const transferParams: Array<CdpEvmDataScalarParam | CdpEvmDataSetParam> =
    recipientAllowlist && recipientAllowlist.length > 0
      ? [{ name: "to", operator: "in", values: recipientAllowlist }, amountParam]
      : [amountParam];

  const rules: CdpPolicyRule[] = [
    {
      action: "accept",
      operation: "sendEvmTransaction",
      criteria: [
        // Restricts `to` (the TOKEN CONTRACT) to USDC -- necessary but, per
        // the M2-4a finding, NOT sufficient for recipient control.
        { type: "evmAddress", addresses: [usdcContractAddress], operator: "in" },
        // Decodes the calldata: THIS is the recipient + amount check that
        // closes the gap (see the module header + ./calldata.ts).
        {
          type: "evmData",
          abi: "erc20",
          conditions: [{ function: "transfer", params: transferParams }],
        },
      ],
    },
  ];

  if (opts.denyNativeEth ?? true) {
    rules.push({
      action: "reject",
      operation: "sendEvmTransaction",
      criteria: [{ type: "ethValue", ethValue: "0", operator: ">" }],
    });
  }

  return rules;
}
