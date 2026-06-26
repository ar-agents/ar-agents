#!/usr/bin/env node
/**
 * Bitso off-ramp — REAL money. Mirrors @ar-agents/treasury's BitsoOffRampAdapter
 * exactly: market-sell USDT on usdt_ars, sweep the realized ARS, withdraw it to
 * the configured CBU/CVU. Self-contained (no build). Requires --confirm.
 *
 *   BITSO_API_KEY=...  BITSO_API_SECRET=...  \
 *   BITSO_CVU=<22-digit CVU/CBU>  BITSO_RECIPIENT_NAME="Nombre Apellido"  \
 *   BITSO_AMOUNT_USDT=5  [BITSO_CVU_TYPE=cvu|cbu]  [BITSO_EXTERNAL_ID=...]  \
 *   node scripts/bitso-offramp-run.mjs --confirm
 *
 * The API key needs trading + withdrawal permission. Keep the secret in YOUR
 * shell. The destination CBU/CVU must be a registered Bitso beneficiary.
 * Defaults: prod api.bitso.com, /v3, book usdt_ars, method bind / network coelsa.
 */

const KEY = process.env.BITSO_API_KEY;
const SECRET = process.env.BITSO_API_SECRET;
const CVU = process.env.BITSO_CVU;
const RECIPIENT = process.env.BITSO_RECIPIENT_NAME;
const AMOUNT = Number(process.env.BITSO_AMOUNT_USDT);
const CVU_TYPE = (process.env.BITSO_CVU_TYPE || "cvu").toLowerCase();
const BASE = (process.env.BITSO_BASE_URL || "https://api.bitso.com").replace(/\/+$/, "");
const PREFIX = `/${(process.env.BITSO_API_PREFIX || "/v3").replace(/^\/+|\/+$/g, "")}`;
const BOOK = process.env.BITSO_BOOK || "usdt_ars";
const EXTERNAL_ID = process.env.BITSO_EXTERNAL_ID || `proof-${AMOUNT}-${CVU}`;
const CONFIRMED = process.argv.includes("--confirm");

function die(msg) { console.error("✗ " + msg); process.exit(2); }
if (!KEY || !SECRET) die("Set BITSO_API_KEY and BITSO_API_SECRET.");
if (!CVU) die("Set BITSO_CVU (the destination CBU/CVU, a registered Bitso beneficiary).");
if (!RECIPIENT) die("Set BITSO_RECIPIENT_NAME (account-holder name).");
if (!Number.isFinite(AMOUNT) || AMOUNT <= 0) die("Set BITSO_AMOUNT_USDT to a positive number.");
if (!CONFIRMED) die("This MOVES REAL MONEY. Re-run with --confirm once the env vars are right.");

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(message) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function req(method, resource, body, isPublic) {
  const path = `${PREFIX}${resource}`;
  const payload = body !== undefined ? JSON.stringify(body) : "";
  const headers = { accept: "application/json" };
  if (payload) headers["content-type"] = "application/json";
  if (!isPublic) {
    const nonce = String(Date.now());
    headers.authorization = `Bitso ${KEY}:${nonce}:${await hmacHex(SECRET, nonce + method + path + payload)}`;
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(payload ? { body: payload } : {}) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok || json?.success === false) {
    throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.message || JSON.stringify(json)?.slice(0, 160)}`);
  }
  return json.payload;
}

(async () => {
  console.log(`Bitso off-ramp (REAL) → ${BASE}${PREFIX}  book=${BOOK}  amount=${AMOUNT} USDT  →  ${CVU_TYPE.toUpperCase()} ${CVU}`);
  const originId = (await sha256Hex(EXTERNAL_ID)).slice(0, 40);

  // 0) idempotency pre-check
  try {
    const existing = await req("GET", `/withdrawals?origin_ids=${encodeURIComponent(originId)}`);
    const w = Array.isArray(existing) ? existing.find((x) => x.origin_id === originId) ?? existing[0] : undefined;
    if (w?.wid) { console.log(`already done (idempotent): wid=${w.wid} status=${w.status} amount=${w.amount}`); process.exit(0); }
  } catch (e) { console.log(`  (origin_id pre-check skipped: ${e.message})`); }

  // 1) quote
  const t = await req("GET", `/ticker?book=${encodeURIComponent(BOOK)}`, undefined, true);
  console.log(`  quote   bid=${t.bid} ARS/USDT  → ~${(AMOUNT * Number(t.bid)).toFixed(2)} ARS (pre-fee)`);

  // 2) market sell USDT -> ARS
  const order = await req("POST", "/orders", { book: BOOK, side: "sell", type: "market", major: String(AMOUNT) });
  console.log(`  sold    oid=${order.oid}`);

  // 3) sweep ARS balance
  await new Promise((r) => setTimeout(r, 1500));
  const bal = await req("GET", "/balance");
  const ars = bal.balances?.find((b) => b.currency === "ars")?.available;
  if (!ars || Number(ars) <= 0) die(`no ARS balance after sale (got ${ars}).`);
  console.log(`  swept   ARS available=${ars}`);

  // 4) withdraw ARS -> CVU/CBU (idempotent via origin_id)
  const wd = await req("POST", "/withdrawals", {
    asset: "ars", currency: "ars", method: "bind", network: "coelsa", protocol: CVU_TYPE,
    amount: ars, max_fee: "0", recipient_name: RECIPIENT, cvu: CVU, origin_id: originId,
  });
  console.log(`  payout  wid=${wd.wid} status=${wd.status}  origin_id=${originId}`);
  console.log(`\n✅ OFF-RAMP FIRED. Poll: node -e "fetch(...)" or check Bitso → History. ARS should land in ${CVU}.`);
})().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
