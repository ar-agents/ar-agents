// Verify the PEM-string adapter mode works end-to-end. Reads the local PEMs
// from disk to simulate what `process.env.AFIP_CERT_PEM` would contain in a
// Vercel deployment.

import { readFileSync } from "node:fs";
import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";

const certPem = readFileSync(process.env.AFIP_CERT_PATH, "utf8");
const keyPem = readFileSync(process.env.AFIP_KEY_PATH, "utf8");

const adapter = new WsaaWscdcAfipPadronAdapter({
  certPem,
  keyPem,
  cuitRepresentado: process.env.AFIP_CUIT_REPRESENTADO,
  env: (process.env.AFIP_ENV ?? "prod"),
});

const cuit = process.argv[2] ?? "20123456786";
console.log(`[smoke-pem] Querying via PEM strings for CUIT ${cuit}...`);
const t0 = Date.now();
const result = await adapter.lookup(cuit);
console.log(`[smoke-pem] Latency: ${Date.now() - t0}ms`);
console.log(JSON.stringify(result, null, 2));

if (!result.available) process.exit(1);
