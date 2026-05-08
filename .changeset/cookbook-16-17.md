---
"@ar-agents/mercadopago": patch
---

Add 2 cookbook recipes that demonstrate the cross-package thesis:

- **16-acp-checkout-with-factura.ts** — the headline ACP-with-factura pattern. A ChatGPT Instant Checkout / Claude / Gemini agent POSTs an ACP `checkout_session`, the bridge mints a Mercado Pago preference, the buyer pays, and the bridge auto-emits an AFIP/ARCA Factura A/B/C/E via the `facturacionHook` — selecting the comprobante type based on the buyer's IVA condition. No other OSS implementation in LATAM ships this end-to-end.
- **17-usa-llc-companion.ts** — pattern for a USA-LLC agent (ClawBank, doola Agentic, MIDAO) operating in Argentina via an AR-resident facade. The USA agent declares `@ar-agents/mcp` in its MCP host config; all 89+6+2+10+5+6+5 tools become available without the USA agent ever holding AR credentials. Walks through the operator-of-record split + sample agent prompt that drives charge → factura → WhatsApp confirmation.

Cookbook is now 17 recipes (was 15).
