/**
 * @ar-agents/wallet-cdp -- a Sociedad Automatizada's USDC wallet on Coinbase
 * CDP (Base), with a CALLDATA-level ERC-20 spend policy and a two-layer
 * approval gate (ROADMAP.md M2-4b).
 *
 * Why CDP: ROADMAP.md M2-4a ran both Coinbase CDP and Circle developer-
 * controlled wallets live on Base Sepolia; only CDP's policy engine actually
 * blocked a violating transfer server-side (Circle's API-key path has no
 * provider-side policy at all). See docs/research/spikes/wallet-provider/
 * COMPARISON.md.
 *
 * Why a NEW package rather than extending `@ar-agents/treasury`: treasury is
 * the FISCAL/off-ramp rail (USDC->ARS conversion via a registered PSAV,
 * AFIP obligations, Ganancias cedular) -- deliberately zod/ai-free at its
 * core and centered on Manteca/Ripio/Mural/Bitso. Wallet PROVISIONING and a
 * PROVIDER'S OWN spend policy are a different, upstream concern (how the
 * society holds and moves its crypto in the first place, before any off-ramp
 * leg exists), match the repo's existing convention of one package per
 * external integration (`@ar-agents/x402`, `@ar-agents/mercadopago`, ...), and
 * pull in a real hard dependency (`@coinbase/cdp-sdk`) treasury's adapters
 * intentionally avoid for their own transports. The two packages compose: a
 * host wires this package's wallet into treasury's world only once real USDC
 * needs to become ARS (ROADMAP.md M2-4c/d).
 */

export {
  ERC20_TRANSFER_ABI,
  ERC20_TRANSFER_SELECTOR,
  encodeErc20TransferCalldata,
  decodeErc20TransferCalldata,
} from "./calldata";

export {
  type CdpPolicyRule,
  type CdpPolicyCriterion,
  type Erc20SpendPolicyOptions,
  buildErc20SpendPolicyRules,
  sanitizePolicyDescription,
} from "./policy";

export {
  type CdpAccountLike,
  type CdpClientLike,
  type CdpEvmClientLike,
  type CdpPoliciesClientLike,
  type CdpPolicyHandle,
  type CdpTransferResult,
  type CdpTokenBalance,
  type CdpListTokenBalancesResult,
  type TransferUsdcOptions,
  type TransferReceipt,
  type TransferFn,
  type ApplySpendPolicyResult,
  createCdpClient,
  createSocietyWallet,
  applySpendPolicy,
  transferUsdc,
  withTransferIdempotency,
} from "./wallet";

// On-chain USDC balance read (ROADMAP.md M2-4d): observes a society wallet's
// current balance so the host can reconcile it into treasury's TreasuryState.
export {
  type UsdcBalance,
  USDC_CONTRACT_BY_NETWORK,
  getUsdcBalance,
} from "./balance";

export {
  type ApproveFn,
  type GuardedTransferUsdcOptions,
  type GuardedTransferUsdcResult,
  guardedTransferUsdc,
} from "./guard";

export { WalletCdpPolicyDeniedError, WalletCdpUpstreamError, classifyCdpError } from "./errors";
