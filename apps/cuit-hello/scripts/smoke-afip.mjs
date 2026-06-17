// Direct smoke test of the AFIP integration. No Next.js, no LLM.
// Uses the WsaaWscdcAfipPadronAdapter to query AFIP homo for a known CUIT.
//
// Run with:
//   node --env-file=.env.local apps/cuit-hello/scripts/smoke-afip.mjs <CUIT>
//
// Defaults: queries CUIT 20-12345678-6 (Naza himself, monotributo Categoría A).

import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";

const cuitToQuery = process.argv[2] ?? "20123456786";

const adapter = new WsaaWscdcAfipPadronAdapter({
  certPath: process.env.AFIP_CERT_PATH,
  keyPath: process.env.AFIP_KEY_PATH,
  cuitRepresentado: process.env.AFIP_CUIT_REPRESENTADO,
  env: (process.env.AFIP_ENV ?? "homo"),
});

console.log(`[smoke] Querying AFIP ${process.env.AFIP_ENV ?? "homo"} for CUIT ${cuitToQuery}...`);
const t0 = Date.now();
const result = await adapter.lookup(cuitToQuery);
const ms = Date.now() - t0;
console.log(`[smoke] Latency: ${ms}ms`);
console.log(JSON.stringify(result, null, 2));

if (!result.available) {
  process.exit(1);
}
