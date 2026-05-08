/**
 * `@ar-agents/agentic-commerce-bridge` — open-source merchant facilitator for the
 * Agentic Commerce Protocol (ACP). Bridges agentic-commerce clients (ChatGPT,
 * Claude, Gemini, etc.) to MercadoLibre and MercadoPago.
 *
 * **Status: WIP scaffolding.** This entry currently re-exports the validated
 * ACP schema set under `src/schemas/`. The runtime — checkout-session creation,
 * webhook signing, `/.well-known/acp.json` discovery, AFIP-fiscal compliance,
 * pluggable state — is being filled in. Track progress in the repo CHANGELOG.
 */

export * from "./schemas/address";
export * from "./schemas/buyer";
export * from "./schemas/common";
export * from "./schemas/discount";
export * from "./schemas/error";
export * from "./schemas/fulfillment";
export * from "./schemas/line-item";
export * from "./schemas/messages";
export * from "./schemas/totals";
