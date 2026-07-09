# M2-4a wallet-provider comparison: Coinbase CDP vs Circle developer-controlled wallets

Decision doc for ROADMAP item M2-4a. Builds on `docs/research/treasury-agent-banking.md`
(sections 2 and 4), which already picked USDC-on-Base as the treasury asset
and named these two candidates. This document narrows that to an
implementation-level decision, backed by this pass's own documentation
research and (once run) the two scripts in this directory.

**How to read the columns.** "From documentation" is filled in now, from
primary vendor docs fetched on 2026-07-09 (URLs cited inline; see also the
header comments of `coinbase-spike.mjs` and `circle-spike.mjs`). "From live
run" is a template: after `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`/
`CDP_WALLET_SECRET` and `CIRCLE_API_KEY`/`CIRCLE_ENTITY_SECRET` are set, run
both scripts and paste their JSON summaries into that column before treating
this decision as final.

## Criteria

| Criterion | Coinbase CDP Agentic Wallets -- from documentation | Circle developer-controlled wallets / Agent Wallets -- from documentation | From live run |
|---|---|---|---|
| **Setup friction** | Server-side SDK (`@coinbase/cdp-sdk`), 3 env vars (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`), one call to get-or-create a named account. [SDK ref](https://docs.cdp.coinbase.com/sdks/cdp-sdks-v2/typescript). Testnet faucet is callable in code (`cdp.evm.requestFaucet`), so a script can self-fund. [Faucet quickstart](https://docs.cdp.coinbase.com/faucets/introduction/quickstart). | Server-side SDK (`@circle-fin/developer-controlled-wallets`), 2 env vars (`CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`), but the entity secret has an extra one-time setup step (generate locally, register via API, keep a recovery file) before any wallet call works. [Register entity secret](https://developers.circle.com/wallets/dev-controlled/register-entity-secret). Wallets also need an explicit wallet-set step first (`createWalletSet` then `createWallets`), one more moving part than Coinbase's single `getOrCreateAccount`. Testnet funding is a manual web faucet (https://faucet.circle.com/), not called from code in the docs surface this pass reached. | *(fill in after running both scripts)* |
| **Custody model** | "Non-custodial" per Coinbase's own framing, more precisely vendor-hosted TEE custody: keys generated and held only inside a Coinbase-operated TEE, never exposed to the agent or the integrating app. [Security overview](https://docs.cdp.coinbase.com/wallets/security-and-policies/security-overview). Same reading as `treasury-agent-banking.md` section 2 `[verified 3-0]`. | 2-of-2 MPC on Circle's user-controlled wallets (for the Agent Wallets product); Circle holds one key share, so it retains a co-sign/freeze capability even though it "cannot unilaterally move funds." For plain developer-controlled wallets (what this spike's SDK actually drives), Circle's own docs describe it as Circle holding custody on the developer's behalf via the entity secret, which is a stronger form of Circle-side control than the Agent Wallets 2-of-2 framing. This distinction (developer-controlled vs the separately marketed Agent Wallets) is not fully reconciled in the docs this pass fetched -- flagged as an open question below. | *(n/a -- not exercised by a testnet run)* |
| **Policy expressiveness** | Server-side policy engine (`cdp.policies.createPolicy` + `cdp.evm.updateAccount(..., { accountPolicy })`), with `evmAddress` allowlists (confirmed, any network) and value-cap criteria `ethValue` (native ETH only) and `netUSDChange` (**mainnet-only** per the docs: "only evaluated for mainnet transactions"). [Policies overview](https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/policies/overview), [EVM policy criteria](https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/policies/evm-policies). **Net effect for this spike:** on Base Sepolia, only the address allowlist is provably enforced; a USDC-denominated per-tx cap is not confirmed enforceable pre-mainnet. | **No policy/rule/allowlist REST endpoint exists for developer-controlled wallets.** The OpenAPI spec (https://developers.circle.com/openapi/developer-controlled-wallets.yaml, fetched and grepped for "policy"/"rule"/"allowlist"/"limit") has none. The separately marketed "Agent Wallets" product advertises transfer limits, recipient allowlists and contract blocklists [Agent Wallets](https://developers.circle.com/agent-stack/agent-wallets), but its quickstart authenticates via an interactive `circle wallet login` CLI session, not the `CIRCLE_API_KEY`/`CIRCLE_ENTITY_SECRET` pair this spike (and M2-4a's stated env-var contract) uses. **Net effect:** this pass found no way to hand a cap or allowlist to Circle's own infrastructure server-side; the `circle-spike.mjs` script enforces both in its own application code instead, which a compromised script can simply skip. | *(fill in after running both scripts)* |
| **x402 / Base fit** | x402 is Coinbase's own protocol; Agentic Wallets natively support it plus a Base gas paymaster (gasless USDC transfers). [Launch page](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets), corroborated in `treasury-agent-banking.md` §2 `[verified 3-0]`. `@ar-agents/x402`'s `X402Signer` type (`packages/x402/src/types.ts`) is a plain `(requirements) => Promise<PaymentPayload>` callback; wiring a CDP account's signing into that shape is a thin adapter, not a redesign. | USDC/x402 payments are supported and gas-sponsored, but the sponsorship is "capped and subject to change." [Agent Wallets docs](https://developers.circle.com/agent-stack/agent-wallets). Same `X402Signer` adapter shape applies; no documented difference in integration effort versus Coinbase. | *(fill in after running both scripts, or after wiring an X402Signer adapter for each and probing x402 test resources)* |
| **Approvals-gate composability** | Neither vendor's policy engine documents an interactive human-approval or escalation primitive (Coinbase's smart-contract-level policy restrictions are marked "coming soon"; nothing about quorums in its policy docs). That means `packages/core/src/risk-manifest.ts`'s `enforceRiskPolicy` -- which classifies any tool name matching `transfer\|payout\|withdraw\|...` as `"money"` risk and gates it behind `withApproval` regardless of which wallet vendor sits underneath -- is REQUIRED either way; the wallet provider is a first, additive layer, never a replacement. Coinbase adds a genuine second, provider-side layer (address allowlist, at minimum) on top of the approvals gate. | Same absence of a human-approval primitive, so the approvals gate is equally required. But because no provider-side policy layer was found to exist for the API-key-authenticated integration path, this candidate does not add a genuine second layer at all: the "two independent layers" design in `treasury-agent-banking.md` §4 collapses to one (the approvals gate) unless Circle's Agent Wallets CLI/login flow is adopted instead, which conflicts with the server-side, API-key-driven automation `ar-agents` needs. | *(fill in after running both scripts)* |
| **Pricing** | Not stated in any doc this pass fetched (research doc `treasury-agent-banking.md` §2 already noted this as "not covered by this research"). The hosted x402 facilitator has published pricing (free tier of 1,000 tx/month, then $0.001/tx) but that is facilitator pricing, not wallet-provider pricing. | Not stated in any doc this pass fetched, same caveat. | *(fill in if either console surfaces pricing during setup)* |
| **Docs quality** | SDK reference, policy reference, and faucet docs are each a single fetch away from a working code sample; every function name and env var used in `coinbase-spike.mjs` came from a primary doc page with no third-party corroboration needed. The CLI-focused pages (`awal`) are a dead end for server-side integration and cost this pass two wasted fetches. | Documentation is fragmented across at least 3 surfaces (Agent Wallets marketing/CLI page, developer-controlled-wallets quickstart, a third-party `circlefin/skills` GitHub repo that had to be cross-checked for the exact `createTransaction` field names) with visible inconsistency between them (`tokenId` vs `tokenAddress` for the same call, see `circle-spike.mjs` header comment). Notably worse experience for reaching a correct, working call from primary docs alone. | *(fill in with total wall-clock time and error count from each script's first successful run)* |

## Ambiguities and how they were resolved (documentation pass)

- **Coinbase: does an attached account policy default-deny an unmatched operation?** Not stated explicitly in any fetched page. Assumed yes (matching Coinbase's own "Policy Engine" framing of closing an agent's unrestricted default) and implemented the allowlist as a single ACCEPT rule. If wrong, the spike's violation check fails loudly (not silently).
- **Coinbase: does `.transfer()` invoke the `signEvmTransaction` or `sendEvmTransaction` policy operation?** Not confirmed from the docs surface reached; the script's policy rule targets `sendEvmTransaction` (the operation name that best matches "submit a signed tx"), with a fallback note in code if that proves wrong.
- **Coinbase: exact response shape of `account.listTokenBalances()`.** Not shown in any fetched page (only the call signature was). The script parses defensively across a couple of plausible shapes and treats a parse failure as "unfunded" rather than risk a false-positive spend.
- **Coinbase: exact CDP Portal menu labels for creating a Secret API Key and a Wallet Secret.** Conceptual auth model was documented; portal navigation/screenshots were not reachable via WebFetch. README points to the authoritative doc URL and describes the flow at the level of confidence the docs support.
- **Circle: `tokenId` vs `tokenAddress` on `createTransaction`.** Two sources disagreed; the more detailed and more recently checked one (`tokenAddress`) was used, flagged in code.
- **Circle: whether `createWallets`/`listWallets` support name-based lookup for reuse.** Not confirmed; implemented with a try/reuse-else-create fallback.
- **Circle vs Circle Agent Wallets: is the 2-of-2 MPC / "cannot unilaterally move funds" framing (Agent Wallets marketing) the same custody model as the plain developer-controlled wallets this spike's SDK drives?** Not reconciled in this pass -- treat as an open question for whoever picks Circle, not a settled fact.

## Provisional recommendation (from documentation alone -- NOT final)

**Provisional: Coinbase CDP Agentic Wallets**, on the strength of one concrete,
documented, server-side, API-key-driven policy engine (`cdp.policies.createPolicy`)
that Circle's equivalent server-side integration path does not have a
documented counterpart for. This is the single load-bearing finding of this
research pass: it is not a marginal preference, it is the presence of a
genuine second enforcement layer (address allowlist, confirmed on any
network) versus none for the API-key auth path this spike targets.

This is **provisional** and should not be treated as final until:

1. Both scripts have been run against real testnet credentials and their
   JSON summaries are pasted into the "from live run" column above.
2. The Coinbase per-tx USDC cap ambiguity (informational-only on testnet,
   per this pass's reading of `ethValue`/`netUSDChange`) is either resolved
   favorably or accepted as a known gap to close in mainnet-only enforcement,
   with the approvals gate (`packages/core/src/risk-manifest.ts`) carrying
   the testnet/general-purpose cap in the meantime.
3. Someone re-checks whether Circle's Agent Wallets CLI flow (`circle wallet
   login`, not API-key auth) could be scripted non-interactively for a
   server-controlled society wallet -- if it can, Circle's policy-expressiveness
   gap narrows and this recommendation should be revisited.

If confirmed, this feeds M2-4b (wallet spend policy wired to the approvals
gate) directly: Coinbase's `cdp.policies.createPolicy` becomes layer one,
`enforceRiskPolicy` remains layer two, exactly as designed in
`treasury-agent-banking.md` §4.


## Live-run findings (2026-07-09, supervised session)

### Circle (complete)
- Wallet soc-spike-1 created on Base Sepolia: 0x6c91a15868af9baf417bce5382c27f9e01ea6140 (dev-controlled, entity secret registered via SDK from the CLI; note: generateEntitySecret() PRINTS the secret and returns undefined, generate your own 32-byte hex instead).
- Funded 20 USDC via faucet.circle.com (no captcha).
- Policy-violating transfer blocked ONLY by our application-level check: confirmed live that the developer-controlled API path exposes no provider-side policy engine.
- Compliant 0.01 USDC transfer INITIATED on-chain. Gotcha: createTransaction rejects tokenAddress with "API parameter invalid"; use tokenId resolved from getWalletTokenBalance.

### Coinbase (partial; blocked on wallet secret retrieval)
- Secret API key created (2FA required per key-creation session; the secret is shown once in a dialog immediately after the human completes 2FA).
- The portal quickstart states API keys need Advanced settings scopes "Non-custodial: Export" and "Non-custodial: Manage" for wallet operations; our key was created without opening Advanced settings, so a 403 on wallet ops may require a rescoped key.
- Agentic Wallet tier is LOCKED behind business verification (KYB): the flagship agent product is not reachable for an unverified individual account. However, the plain API-key-wallet tier exposes Policies (project policy and account policies: transaction limits, allowed addresses) UN-gated at portal /wallets/non-custodial/security, which is the capability this spike actually needs.
- SDK confirms CDP_WALLET_SECRET is mandatory for any account creation; there is no API to create the wallet secret (portal-only, shown once).
- Automation landmine: clicking Generate Wallet Secret freezes the portal renderer for CDP-protocol injection (dialog work never reaches document_idle); the step must be done by a human.

### Revised assessment pending the Coinbase live leg
Circle: works end to end today but with NO provider-side policy: every guarantee is application-level. Coinbase: policy engine exists at the right tier without KYB, but onboarding has sharp edges (per-session 2FA, portal-only wallet secret, key scopes). If the Coinbase live leg confirms server-side policy blocking a violating transfer, Coinbase remains the recommendation; if key scoping or the wallet secret path proves unreliable, reconsider Circle plus our approvals gate as the only policy layer.


## DECISION (2026-07-09, both legs run live)

**Recommendation: Coinbase CDP for the society wallet layer.** Confirmed live, not from docs:

- Coinbase: `policyEnforced: true`. A server-side account policy was created and attached, and a transfer that violated it was rejected before signing with "The request is forbidden due to violating at least one configured policy." This is the capability the treasury design needs at the wallet layer.
- Circle (developer-controlled API path): `policyEnforced: false`. No provider-side policy/allowlist endpoint exists on that path; the violating transfer was stopped only by our own application-level check. Circle's separately marketed Agent Wallets product advertises policies but is gated behind an interactive CLI login, not the API-key auth this design uses.
- Coinbase's Agentic Wallet tier is KYB-locked (business verification), but the plain API-key-wallet tier exposes the same project/account policy engine un-gated, which is what an unverified individual founder can use today.

**Material implementation finding for M2-4b (ERC-20 recipient allowlists):** Coinbase's `evmAddress` policy criterion matches the transaction's `to` field. For a native ETH transfer that is the recipient, so recipient allowlisting works directly. For an ERC-20 USDC transfer the transaction `to` is the USDC CONTRACT address, and the real recipient sits in the `transfer(to,amount)` calldata. Consequence: a plain `evmAddress` allowlist cannot distinguish a good USDC recipient from a bad one (both transactions go to the token contract) and will block or allow them together. Recipient-level control over stablecoin transfers therefore requires a calldata-level policy rule (matching the decoded `transfer` recipient), not an address allowlist. Wire M2-4b with calldata rules for USDC, and keep the ar-agents approvals gate as the mandatory second layer regardless, since no provider rule covers the fiat off-ramp leg.

**Onboarding friction observed (both real, both one-time):** Coinbase requires 2FA per key-creation session, the wallet secret is portal-only and shown once (its Generate dialog also resists browser automation), and wallet/policy operations need a key created with the Advanced-settings scope "Non-custodial: Manage". Circle requires a separately-registered entity secret (generate your own 32-byte hex; the SDK's generateEntitySecret only prints) and uses tokenId, not tokenAddress, on createTransaction.
