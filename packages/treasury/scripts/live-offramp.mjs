/**
 * Live off-ramp run for @ar-agents/treasury — rails 2+3 of the bridge: USDC->ARS
 * via a registered PSAV (Manteca / Ripio B2B), then the honest AFIP fiscal plan.
 * Companion to x402's scripts/live-testnet.mjs (rail 1, already proven on Base
 * Sepolia: sepolia.basescan.org/tx/0x0407257c36f40fca0392a0bbf099644aa9a212bf6d16e6e398d930666aedf37f).
 *
 * Plain `node` (no tsx). Build the packages once, then:
 *
 *   pnpm --filter @ar-agents/treasury build
 *   node packages/treasury/scripts/live-offramp.mjs            # offline full-loop demo (no creds, runs anywhere)
 *   node packages/treasury/scripts/live-offramp.mjs ripio      # live QUOTE vs the REAL Ripio sandbox
 *   node packages/treasury/scripts/live-offramp.mjs manteca    # live QUOTE vs the REAL Manteca API
 *   node packages/treasury/scripts/live-offramp.mjs ripio --convert --usd=25   # IRREVERSIBLE off-ramp (your call)
 *
 * Credentials are sales-gated B2B onboarding (NOT self-serve). Set via env:
 *   Ripio:   RIPIO_CLIENT_ID, RIPIO_CLIENT_SECRET, RIPIO_CUSTOMER_ID, RIPIO_FIAT_ACCOUNT_ID
 *            [RIPIO_BASE_URL — defaults to the sandbox host]
 *   Manteca: MANTECA_API_KEY, MANTECA_USER_ID, MANTECA_BANK_ACCOUNT_ID [MANTECA_BASE_URL]
 *
 * quote() is read-only + safe. convert() SELLS real USDC and pays ARS to a CVU —
 * irreversible. It runs ONLY with the explicit --convert flag and is YOUR action
 * to confirm (RFC-001 / signed audit log), never automated.
 */

import {
  InMemoryOffRampAdapter,
  MantecaOffRampAdapter,
  RipioOffRampAdapter,
  MuralOffRampAdapter,
  RIPIO_SANDBOX,
  MURAL_SANDBOX,
  fundTaxBuffer,
  requiredArsBuffer,
  monotributoCuota,
  settlementPlan,
  applyPayment,
  cedularTax,
} from "../dist/index.js";

const argv = process.argv.slice(2);
const provider = argv.find((a) => a === "ripio" || a === "manteca" || a === "mural") ?? null;
const doConvert = argv.includes("--convert");
const usd = Number((argv.find((a) => a.startsWith("--usd=")) ?? "--usd=25").split("=")[1]);
const ars = (n) => `ARS ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

// ── env wiring (matches the generated society's getOffRamp + the docs) ──────────
function ripioFromEnv() {
  const c = {
    clientId: process.env.RIPIO_CLIENT_ID,
    clientSecret: process.env.RIPIO_CLIENT_SECRET,
    customerId: process.env.RIPIO_CUSTOMER_ID,
    fiatAccountId: process.env.RIPIO_FIAT_ACCOUNT_ID,
    baseUrl: process.env.RIPIO_BASE_URL ?? RIPIO_SANDBOX,
  };
  const missing = ["clientId", "clientSecret", "customerId", "fiatAccountId"].filter((k) => !c[k]);
  return { c, missing };
}
function mantecaFromEnv() {
  const c = {
    apiKey: process.env.MANTECA_API_KEY,
    userId: process.env.MANTECA_USER_ID,
    bankAccountId: process.env.MANTECA_BANK_ACCOUNT_ID,
    ...(process.env.MANTECA_BASE_URL ? { baseUrl: process.env.MANTECA_BASE_URL } : {}),
  };
  const missing = ["apiKey", "userId", "bankAccountId"].filter((k) => !c[k]);
  return { c, missing };
}
function muralFromEnv() {
  const c = {
    apiKey: process.env.MURAL_API_KEY,
    transferApiKey: process.env.MURAL_TRANSFER_API_KEY,
    sourceAccountId: process.env.MURAL_SOURCE_ACCOUNT_ID,
    ...(process.env.MURAL_ORGANIZATION_ID ? { organizationId: process.env.MURAL_ORGANIZATION_ID } : {}),
    bankName: process.env.MURAL_BANK_NAME ?? "",
    bankAccountOwner: process.env.MURAL_BANK_ACCOUNT_OWNER ?? "",
    cvu: process.env.MURAL_CVU,
    cvuType: process.env.MURAL_CVU_TYPE ?? "CVU",
    documentNumber: process.env.MURAL_DOCUMENT_NUMBER,
    recipient: {
      type: "business",
      name: process.env.MURAL_BANK_ACCOUNT_OWNER ?? "Sociedad Automatizada",
      physicalAddress: process.env.MURAL_RECIPIENT_ADDRESS_JSON
        ? JSON.parse(process.env.MURAL_RECIPIENT_ADDRESS_JSON)
        : { country: "AR" },
    },
    baseUrl: process.env.MURAL_BASE_URL ?? MURAL_SANDBOX,
  };
  const missing = ["apiKey", "transferApiKey", "sourceAccountId", "cvu", "documentNumber"].filter((k) => !c[k]);
  return { c, missing };
}
const ENV = { ripio: ripioFromEnv, manteca: mantecaFromEnv, mural: muralFromEnv };
const ADAPTER = {
  ripio: (c) => new RipioOffRampAdapter(c),
  manteca: (c) => new MantecaOffRampAdapter(c),
  mural: (c) => new MuralOffRampAdapter(c),
};

const HELP = {
  ripio:
    "Ripio B2B: request sandbox credentials (the sandbox host " +
    RIPIO_SANDBOX +
    " is already live + wire-verified). Need client_id/client_secret, a customerId, and a\n" +
    "  registered fiatAccountId (your CVU — adapter.registerFiatAccount()). Then:\n" +
    "  RIPIO_CLIENT_ID=… RIPIO_CLIENT_SECRET=… RIPIO_CUSTOMER_ID=… RIPIO_FIAT_ACCOUNT_ID=… \\\n" +
    "    node packages/treasury/scripts/live-offramp.mjs ripio",
  manteca:
    "Manteca: request API Cripto + API Rampa access (no self-serve keys). They issue your\n" +
    "  live API host + md-api-key; set a userId and register your CVU as bankAccountId\n" +
    "  (adapter.registerBankAccount()). Then:\n" +
    "  MANTECA_API_KEY=… MANTECA_USER_ID=… MANTECA_BANK_ACCOUNT_ID=… \\\n" +
    "    node packages/treasury/scripts/live-offramp.mjs manteca",
  mural:
    "Mural: create a Mural Organization + complete KYB (self-driven, no sales gate), then\n" +
    "  Settings > Developers for the API key + transfer-api-key. Sandbox = " +
    MURAL_SANDBOX +
    "\n  (auto-approves KYB, testnet-faucet funding). Then:\n" +
    "  MURAL_API_KEY=… MURAL_TRANSFER_API_KEY=… MURAL_SOURCE_ACCOUNT_ID=… MURAL_CVU=… \\\n" +
    "    MURAL_DOCUMENT_NUMBER=… MURAL_BANK_NAME=… MURAL_BANK_ACCOUNT_OWNER=… \\\n" +
    "    node packages/treasury/scripts/live-offramp.mjs mural",
};

// ── offline full-loop demo: rail 1 (real EIP-712 intake) -> rails 2/3 ──────────
async function offlineDemo() {
  console.log("── Offline full-loop demo (no PSAV creds, no network, no funds) ──\n");
  const FX = 1200; // ILLUSTRATIVE ARS per USD (confirm the live rate via a real quote)
  const DAY = 86_400_000;
  const NOW = 1_750_000_000_000;

  // rail 1: the society earned 50 USDC for a service. Crypto intake is
  // @ar-agents/x402's job (HTTP-402 on Base, proven on-chain); here we just take
  // the received amount as the seam where x402 hands off to the treasury.
  const received = 50;
  console.log(`rail 1 · intake     earned ${received} USDC (via @ar-agents/x402 in production)`);

  let state = { usd: received, ars: 0, costBasisPerUsd: 1 };

  // rail 3: a monotributo cuota comes due in 5 days -> size the peso buffer.
  const cuota = monotributoCuota("A", "servicios");
  const obligations = [{ id: "mono-2026-06", kind: "monotributo", amountArs: cuota, dueAtMs: NOW + 5 * DAY }];
  const buffer = requiredArsBuffer(obligations, NOW, 30 * DAY);
  console.log(`rail 3 · obligation monotributo cat A (servicios) = ${ars(cuota)} due in 5d; buffer (×1.1) = ${ars(buffer)}`);

  // rail 2: convert JUST enough USDC to fund the buffer (in-memory PSAV here).
  const { plan, receipt, state: funded } = await fundTaxBuffer({
    state, obligations, nowMs: NOW, horizonMs: 30 * DAY, fxRate: FX,
    offramp: new InMemoryOffRampAdapter(FX, 0.01),
  });
  state = funded;
  console.log(`rail 2 · off-ramp   converted ${plan.convertUsd.toFixed(4)} USDC -> ${ars(receipt.arsReceived)} @ ${receipt.rate} (${plan.reason})`);
  const tax = cedularTax(plan.convertUsd, 1, FX, "ARS");
  console.log(`         cedular tax on the disposal (5% of gain) = ${ars(tax)} (0 when USDC≈cost basis)`);

  // pay the obligation from ARS; emit the HONEST settlement instruction.
  const afterPay = applyPayment(state, cuota);
  const sp = settlementPlan(obligations[0], "debito_automatico");
  console.log(`         paid cuota -> ARS left ${ars(afterPay.ars)}, USDC kept ${state.usd.toFixed(4)} (no over-convert)`);
  console.log(`rail 3 · settlement method=${sp.method} autonomy=${sp.autonomy} canAutoExecute=${sp.canAutoExecute} (the rail funds + instructs; it does NOT pretend to auto-pay AFIP)`);
  console.log("\n✓ loop closes: crypto in -> pesos buffered -> obligation payable -> honest AFIP instruction.\n");
  console.log("To prove a rail against a REAL PSAV, pass `ripio` or `manteca` (needs sales-gated creds):");
  console.log("  " + HELP.ripio + "\n");
}

// ── live quote (read-only) against a real PSAV; optional irreversible convert ──
async function liveRun(which) {
  const { c, missing } = ENV[which]();
  if (missing.length) {
    console.log(`No ${which} credentials in env (missing: ${missing.join(", ")}).\n`);
    console.log(HELP[which] + "\n");
    console.log("Falling back to the offline demo so you can still see the loop:\n");
    return offlineDemo();
  }
  const adapter = ADAPTER[which](c);
  console.log(`── Live ${which} quote: ${usd} USDC -> ARS (read-only) ──\n`);
  try {
    const q = await adapter.quote(usd);
    console.log(`rate ${q.rate} ARS/USDC  ->  ${ars(q.arsOut)} for ${usd} USDC  (spread ${q.spread})`);

    if (!doConvert) {
      console.log("\nquote only. Re-run with --convert to execute the IRREVERSIBLE off-ramp.");
      return;
    }
    console.log("\n⚠️  --convert: this SELLS " + usd + " USDC and pays ARS to your CVU. Irreversible.");
    const receipt = await adapter.convert(usd, { externalId: `live-offramp-${usd}` });
    console.log("\nSUBMITTED:");
    console.log("  txId/session : " + receipt.txId);
    console.log("  expected ARS : " + ars(receipt.arsReceived) + " @ " + receipt.rate);
    if (receipt.depositAddress) console.log("  deposit addr : " + receipt.depositAddress + "  (send " + usd + " USDC here to complete — Ripio session model)");
    console.log("\nPoll settlement with adapter.getStatus(txId). This receipt is what credits the treasury.");
  } catch (err) {
    const status = err?.status;
    const reason = err?.body?.error ?? err?.body?.message;
    if (status === 401 || status === 403) {
      // Expected boundary: we reached the REAL API, it rejected the credentials.
      console.log(`Reached the real ${which} API — it rejected the credentials (HTTP ${status}${reason ? `, "${reason}"` : ""}).`);
      console.log("That proves the wire path end-to-end; you just need valid credentials:\n");
      console.log(HELP[which]);
      return;
    }
    console.log(`${which} call failed (HTTP ${status ?? "?"}): ${err?.message ?? err}`);
    if (err?.body) console.log("  body: " + JSON.stringify(err.body));
    process.exitCode = 1;
  }
}

if (provider) {
  await liveRun(provider);
} else {
  await offlineDemo();
}
