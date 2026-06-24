/**
 * Live testnet run for @ar-agents/x402 — proves the intake rail settles a REAL
 * USDC payment on Base Sepolia via the public x402.org facilitator (no API key,
 * no business account, free). This is rung A of the live-run ladder.
 *
 * Usage (from the repo root):
 *   1) First run with no key — it generates a payer wallet + prints its address:
 *        npx tsx packages/x402/scripts/live-testnet.ts
 *   2) Fund that address with Base Sepolia USDC at https://faucet.circle.com
 *      (choose "Base Sepolia", paste the address). One ~2-min browser step.
 *   3) Re-run with the key to execute the real on-chain settlement:
 *        X402_TEST_PRIVATE_KEY=0x... npx tsx packages/x402/scripts/live-testnet.ts
 *
 * Optional env:
 *   X402_TEST_PAYTO   recipient ("society") address; default = a fresh generated one
 *   X402_TEST_USDC    amount in USDC; default 0.01
 *   BASE_SEPOLIA_RPC  RPC url; default https://sepolia.base.org
 *
 * The payer signs a gasless EIP-3009 authorization; the x402.org facilitator
 * broadcasts transferWithAuthorization on Base Sepolia (it pays the gas). USDC
 * moves payer -> payTo; we print the basescan tx link to verify it landed.
 */

import { createPublicClient, http, getAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  X402Receiver,
  HostedFacilitatorClient,
  NETWORKS,
  usdcToAtomic,
  encodePaymentHeader,
  signExactPayment,
} from "../src/index";

const KEY = process.env.X402_TEST_PRIVATE_KEY as `0x${string}` | undefined;

if (!KEY) {
  const k = generatePrivateKey();
  const a = privateKeyToAccount(k);
  console.log("No X402_TEST_PRIVATE_KEY set — generated a throwaway payer wallet:\n");
  console.log("  address:     " + a.address);
  console.log("  privateKey:  " + k + "   (TESTNET ONLY — never commit / never reuse on mainnet)\n");
  console.log("Next:");
  console.log("  1. Fund the ADDRESS with Base Sepolia USDC at https://faucet.circle.com");
  console.log("     (select Base Sepolia, paste the address above).");
  console.log("  2. Re-run to settle a real on-chain payment:");
  console.log(`     X402_TEST_PRIVATE_KEY=${k} npx tsx packages/x402/scripts/live-testnet.ts`);
  process.exit(0);
}

const NETWORK = "base-sepolia" as const;
const USDC = Number(process.env.X402_TEST_USDC ?? "0.01");
const RPC = process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";

const ERC20_BALANCE_OF = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function main() {
  const payer = privateKeyToAccount(KEY!);
  const payTo = getAddress(
    process.env.X402_TEST_PAYTO ?? privateKeyToAccount(generatePrivateKey()).address,
  );
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });

  // Pre-flight: does the payer hold enough testnet USDC?
  const bal = (await publicClient.readContract({
    address: NETWORKS[NETWORK].usdc,
    abi: ERC20_BALANCE_OF,
    functionName: "balanceOf",
    args: [getAddress(payer.address)],
  })) as bigint;
  console.log(`payer ${payer.address}`);
  console.log(`  USDC (Base Sepolia): ${Number(bal) / 1e6}`);
  if (bal < BigInt(usdcToAtomic(USDC))) {
    console.error(
      `\nNeed >= ${USDC} USDC. Fund ${payer.address} at https://faucet.circle.com (Base Sepolia), then re-run.`,
    );
    process.exit(1);
  }

  // The society's intake side: build requirements + receiver (real testnet facilitator).
  const receiver = new X402Receiver({ facilitator: new HostedFacilitatorClient() });
  const price = { usdc: USDC, network: NETWORK, payTo, resource: "https://demo.sociedad.ar/ping" };
  const requirements = receiver.requirements(price);

  // The payer side: sign the EIP-3009 authorization + encode the X-PAYMENT header.
  const payment = await signExactPayment({ account: payer, requirements });
  const header = encodePaymentHeader(payment);

  console.log(`\nPaying ${USDC} USDC -> ${payTo} on ${NETWORK} via x402.org ...`);
  const result = await receiver.process(header, requirements);
  if (!result.ok) {
    console.error("FAILED: " + result.reason);
    process.exit(1);
  }
  console.log("\nSETTLED on-chain:");
  console.log("  payer:    " + result.receipt.payer);
  console.log("  amount:   " + result.receipt.amountUsdc + " USDC");
  console.log("  tx:       " + result.receipt.txId);
  console.log("  explorer: https://sepolia.basescan.org/tx/" + result.receipt.txId);
  console.log("\nRail 1 (x402 intake) proven on a real chain. The X402Receipt is what feeds the treasury.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
