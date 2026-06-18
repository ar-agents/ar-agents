import { defineAgent } from "eve";

// Opus for the legal reasoning the incorporation flow needs. The model id
// resolves through the Vercel AI Gateway, with provider fallbacks. Swap to
// "anthropic/claude-sonnet-4.6" to trade some quality for cost per session.
export default defineAgent({
  model: "anthropic/claude-opus-4.8",
  // A full incorporation is a long conversation (gather data, validate the CUIT,
  // draft the plan, park for approval, log). Compact once the context window
  // fills past 80% so the durable session keeps going instead of erroring; the
  // summary is generated with the active turn model.
  compaction: { thresholdPercent: 0.8 },
});
