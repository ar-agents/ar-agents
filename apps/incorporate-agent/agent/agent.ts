import { defineAgent } from "eve";

// Opus for the legal reasoning the incorporation flow needs. The model id
// resolves through the Vercel AI Gateway, with provider fallbacks. Swap to
// "anthropic/claude-sonnet-4.6" to trade some quality for cost per session.
export default defineAgent({
  model: "anthropic/claude-opus-4.8",
});
