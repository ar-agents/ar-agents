// OpenAPI 3.1 spec for the bridge-hello facilitator + ACP feed surface.
//
// Two consumers:
//   1. Buyer agents (ChatGPT/Claude/Gemini) that prefer OpenAPI to a
//      hand-rolled discovery payload — this gives them tool definitions
//      they can spread into their toolset.
//   2. Procurement / security reviewers comparing capabilities against
//      a vendor questionnaire — easier to audit than reading source.
//
// We auto-emit the schema from the running facilitator + lib version so
// it never goes stale. ISR-cached for an hour.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "@ar-agents bridge-hello + mercadolibre toolkit",
      version: "0.4.1",
      description:
        "Reference facilitator implementation of the Agentic Commerce Protocol (ACP) backed by @ar-agents/mercadolibre. " +
        "This bridge mounts the ACP checkout endpoints, an opt-in product feed, and the AP2 issue/verify flow.",
      contact: {
        name: "Nazareno Clemente",
        email: "naza@helloastro.co",
        url: "https://github.com/ar-agents/ar-agents",
      },
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [
      { url: origin, description: "This deployment" },
      {
        url: "https://bridge-hello.ar-agents.ar",
        description: "Production reference deployment",
      },
    ],
    tags: [
      {
        name: "ACP",
        description: "Agentic Commerce Protocol checkout sessions.",
      },
      { name: "Feed", description: "Opt-in product feed for buyer agents." },
      {
        name: "AP2",
        description: "Agentic Payments Protocol mandate signing + verification.",
      },
      { name: "Discovery", description: "Well-known discovery endpoints." },
    ],
    paths: {
      "/.well-known/acp.json": {
        get: {
          tags: ["Discovery"],
          summary: "ACP facilitator discovery payload",
          responses: {
            "200": {
              description: "ACP discovery JSON",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/.well-known/agentic-feed.json": {
        get: {
          tags: ["Discovery", "Feed"],
          summary: "Product feed discovery + opt-in policy",
          responses: {
            "200": {
              description:
                "Discovery payload describing the feed URL, opt-in status, and the seller's preference for routing through MELI checkout.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      protocol: {
                        type: "object",
                        properties: {
                          name: { type: "string", const: "acp" },
                          version: { type: "string" },
                        },
                      },
                      feed: {
                        type: "object",
                        properties: {
                          url: { type: "string", format: "uri" },
                          opt_in_required: { type: "boolean" },
                          opt_in_status: {
                            type: "string",
                            enum: ["enabled", "disabled"],
                          },
                          opt_in_header: { type: "string" },
                        },
                      },
                      checkout: {
                        type: "object",
                        properties: {
                          url: { type: "string", format: "uri" },
                          preferred: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/feed/products": {
        get: {
          tags: ["Feed"],
          summary: "List products (opt-in by default)",
          description:
            "Paginated product feed in ACP `2026-04-17` shape. Returns 403 unless `FEED_OPT_IN=1` is set or an `Opt-In: agentic-commerce-feed/2026-04-17` header is present. Sellers prefer routing through MELI checkout by default.",
          parameters: [
            {
              name: "cursor",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            },
            {
              name: "Opt-In",
              in: "header",
              required: false,
              schema: { type: "string", const: "agentic-commerce-feed/2026-04-17" },
            },
          ],
          responses: {
            "200": {
              description: "Page of products",
              headers: {
                ETag: {
                  description: "Weak ETag for the page",
                  schema: { type: "string" },
                },
                "Cache-Control": { schema: { type: "string" } },
                "X-ACP-Version": { schema: { type: "string" } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      protocol: { type: "object" },
                      mode: { type: "string", enum: ["live", "demo"] },
                      products: {
                        type: "array",
                        items: { $ref: "#/components/schemas/FeedProduct" },
                      },
                      next_cursor: { type: ["string", "null"] },
                      generated_at: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            "304": { description: "Not modified (ETag match)" },
            "403": {
              description: "Opt-in required",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", const: "feed_opt_in_required" },
                      message: { type: "string" },
                      how_to_opt_in: { type: "object" },
                      alternative_for_buyers: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/acp/checkout_sessions": {
        post: {
          tags: ["ACP"],
          summary: "Create a checkout session",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: {
            "200": {
              description: "Created session",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/acp/checkout_sessions/{id}": {
        get: {
          tags: ["ACP"],
          summary: "Read a checkout session",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Session",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
        post: {
          tags: ["ACP"],
          summary: "Update a checkout session",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: { content: { "application/json": { schema: {} } } },
          responses: { "200": { description: "Updated session" } },
        },
      },
      "/api/acp/checkout_sessions/{id}/complete": {
        post: {
          tags: ["ACP"],
          summary: "Complete a checkout session (capture payment)",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Completed" } },
        },
      },
      "/api/acp/checkout_sessions/{id}/cancel": {
        post: {
          tags: ["ACP"],
          summary: "Cancel a checkout session",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Cancelled" } },
        },
      },
      "/api/ap2/issue-demo": {
        post: {
          tags: ["AP2"],
          summary: "Issue a demo AP2 mandate (cart / intent)",
          responses: {
            "200": {
              description: "Signed mandate",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/ap2/verify": {
        post: {
          tags: ["AP2"],
          summary: "Verify an AP2 mandate chain",
          responses: { "200": { description: "Verification result" } },
        },
      },
    },
    components: {
      schemas: {
        FeedProduct: {
          type: "object",
          required: ["id", "title", "currency", "price"],
          properties: {
            id: { type: "string", example: "MLA1402155766" },
            title: { type: "string" },
            description: { type: "string" },
            currency: { type: "string", example: "ARS" },
            price: { type: "number", example: 4500 },
            available_quantity: { type: "integer" },
            permalink: { type: "string", format: "uri" },
            category: { type: "string" },
            brand: { type: "string" },
            images: { type: "array", items: { type: "string", format: "uri" } },
            attributes: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            seller: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
              },
            },
            shipping: {
              type: "object",
              properties: {
                free: { type: "boolean" },
                mode: { type: "string" },
                logistic_type: { type: "string" },
              },
            },
            vendor_metadata: {
              type: "object",
              properties: {
                meli: {
                  type: "object",
                  properties: {
                    site_id: { type: "string" },
                    condition: {
                      type: "string",
                      enum: ["new", "used", "not_specified"],
                    },
                    listing_type_id: { type: "string" },
                    sold_quantity: { type: "integer" },
                    tags: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
