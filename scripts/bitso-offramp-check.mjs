#!/usr/bin/env node
/**
 * Bitso off-ramp live proof. Self-contained (no build needed) — mirrors the
 * EXACT signing that @ar-agents/treasury's BitsoOffRampAdapter uses, so a green
 * run proves the adapter will authenticate against the real Bitso API.
 *
 *   AUTH PROOF (read-only, moves NOTHING):
 *     BITSO_API_KEY=... BITSO_API_SECRET=... node scripts/bitso-offramp-check.mjs
 *
 *   Options (env):
 *     BITSO_BASE_URL   default https://api.bitso.com  (sandbox: https://api-stage.bitso.com)
 *     BITSO_API_PREFIX default auto: tries /v3 then /api/v3 and reports which works
 *     BITSO_BOOK       default usdt_ars
 *
 * The secret stays in YOUR shell; this script only prints success + balances +
 * the live bid. No order, no withdrawal — that's a separate, gated step
 * (scripts/bitso-offramp-run.mjs).
 */

const KEY = process.env.BITSO_API_KEY;
const SECRET = process.env.BITSO_API_SECRET;
const BASE = (process.env.BITSO_BASE_URL || "https://api.bitso.com").replace(/\/+$/, "");
const BOOK = process.env.BITSO_BOOK || "usdt_ars";
const PREFIXES = process.env.BITSO_API_PREFIX
  ? [`/${process.env.BITSO_API_PREFIX.replace(/^\/+|\/+$/g, "")}`]
  : ["/v3", "/api/v3"];

if (!KEY || !SECRET) {
  console.error("Set BITSO_API_KEY and BITSO_API_SECRET in the environment.");
  process.exit(2);
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signedGet(prefix, resource) {
  const path = `${prefix}${resource}`;
  const nonce = String(Date.now());
  const signature = await hmacHex(SECRET, nonce + "GET" + path + "");
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: { accept: "application/json", authorization: `Bitso ${KEY}:${nonce}:${signature}` },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function publicGet(prefix, resource) {
  const res = await fetch(`${BASE}${prefix}${resource}`, { headers: { accept: "application/json" } });
  return res.json();
}

(async () => {
  console.log(`Bitso off-ramp check → ${BASE}  book=${BOOK}`);

  // 1) Public quote (no auth) — proves connectivity + the book exists.
  let bid;
  for (const p of PREFIXES) {
    try {
      const t = await publicGet(p, `/ticker?book=${encodeURIComponent(BOOK)}`);
      if (t?.success && t?.payload?.bid) { bid = Number(t.payload.bid); console.log(`  ticker  ✓  ${p}/ticker  bid=${bid} ARS/${BOOK.split("_")[0].toUpperCase()}`); break; }
    } catch { /* try next prefix */ }
  }
  if (!bid) console.log("  ticker  ✗  could not read a bid (check BITSO_BOOK / connectivity)");

  // 2) Signed balance (auth proof + prefix auto-detect). READ ONLY.
  let authed = false;
  for (const p of PREFIXES) {
    const { status, json } = await signedGet(p, "/balance");
    if (status === 200 && json?.success) {
      authed = true;
      const balances = json.payload?.balances ?? [];
      const pick = (c) => balances.find((b) => b.currency === c)?.available ?? "0";
      console.log(`  auth    ✓  signed GET ${p}/balance  (apiPrefix="${p}")`);
      console.log(`           ARS=${pick("ars")}  USDT=${pick("usdt")}`);
      console.log(`\n→ Set BITSO_API_PREFIX="${p}" in the adapter config for this host.`);
      break;
    } else {
      const msg = json?.error?.message || json?.error?.code || JSON.stringify(json)?.slice(0, 120);
      console.log(`  auth    ✗  ${p}/balance → HTTP ${status}  ${msg ?? ""}`);
    }
  }

  if (authed) {
    console.log("\nAUTH PROOF PASSED — the adapter's signing works against the real Bitso API. ✅");
    process.exit(0);
  }
  console.log("\nAUTH PROOF FAILED — key/secret wrong, key lacks read permission, or path convention differs.");
  process.exit(1);
})();
