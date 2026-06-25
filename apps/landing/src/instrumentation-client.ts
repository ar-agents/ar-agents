// BotID client init (Next.js 15.3+). Attaches the invisible bot-challenge to
// the LISTED routes only. We protect just /api/demo — the browser live-chat that
// spends real AI Gateway tokens, the one route here where an IP-rotating bot
// could run up cost beneath the IP rate limiter. The rest of the API
// (/api/[transport] MCP, /api/x402/cuit, /api/openapi, /api/discovery, audit
// endpoints) is INTENTIONALLY machine-callable and must never be bot-gated.
import { initBotId } from "botid/client/core";

initBotId({
  protect: [{ path: "/api/demo", method: "POST" }],
});
