// Discovery payload for the ACP product feed. Buyer agents (ChatGPT,
// Claude, Gemini, etc.) hit a well-known path to learn where the product
// catalog lives + which protocol versions it supports.
//
// Convention: RFC 8615 well-known URI namespace + the ACP feed extension.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600; // discovery doesn't change often

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const optedIn = process.env["FEED_OPT_IN"] === "1";
  const body = {
    protocol: {
      name: "acp",
      version: "2026-04-17",
      supported_versions: ["2026-04-17"],
    },
    feed: {
      url: `${origin}/api/feed/products`,
      paginated: true,
      cursor_param: "cursor",
      limit_param: "limit",
      max_limit: 200,
      cache_seconds: 60,
      content_type: "application/json",
      // Honest disclosure: the feed is opt-in. Buyer agents that find this
      // discovery payload should respect the seller's default preference of
      // routing transactions through MELI checkout rather than scraping.
      opt_in_required: !optedIn,
      opt_in_status: optedIn ? "enabled" : "disabled",
      opt_in_header: "Opt-In: agentic-commerce-feed/2026-04-17",
      preference_note:
        "By default, sellers prefer buyer agents to use the MELI-aware checkout below. " +
        "The feed exists as an explicit choice for sellers who want broader agent discovery.",
    },
    checkout: {
      url: `${origin}/api/acp/checkout_sessions`,
      bridge: `${origin}/.well-known/acp.json`,
      preferred: true,
    },
    documentation:
      "https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre",
  };
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
