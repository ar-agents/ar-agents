/**
 * GET /api/openapi.json (served at /api/openapi)
 *
 * Machine-readable OpenAPI 3.1 schema for the public /api/play/* surface
 * + /api/discovery + /api/auto-incorporate. Designed for AI agents that
 * introspect this site (Claude, ChatGPT, Perplexity, custom orchestrators)
 * + for tooling generators (openapi-typescript, openapi-fetch, etc.).
 *
 * Edge runtime — static JSON; no I/O.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

const SITE = "https://ar-agents.vercel.app";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "/arg public API",
    summary:
      "Public endpoints for the AR sociedad-IA reference implementation: discovery, demo agent, audit-log read + verify + export + stream, badge, auto-incorporate wizard.",
    description:
      "The endpoints below are all unauthenticated + idempotent in their default verbs (GET). POST endpoints are explicitly marked; some are rate-limited. The audit-log endpoints implement RFC-004 v1; the discovery endpoint implements RFC-002 v1; the auto-incorporate endpoint implements the wizard backing RFC-001 § 6.\n\nMachine-readable schema. Source: https://ar-agents.vercel.app/api/openapi",
    version: "1.0.0",
    contact: {
      name: "Nazareno Clemente",
      email: "naza@helloastro.co",
      url: "https://ar-agents.vercel.app",
    },
    license: {
      name: "MIT (code) + CC-BY-4.0 (specs)",
      url: "https://github.com/ar-agents/ar-agents/blob/main/LICENSE",
    },
  },
  servers: [
    { url: SITE, description: "Production" },
  ],
  externalDocs: {
    description: "Architecture + RFCs",
    url: `${SITE}/rfcs/004`,
  },
  tags: [
    { name: "audit", description: "RFC-004 operational-log endpoints" },
    { name: "discovery", description: "RFC-002 well-known discovery" },
    { name: "incorporate", description: "Sociedad-IA wizard" },
    { name: "demo", description: "Reference agent + tamper demo" },
    { name: "badge", description: "SVG verification badge" },
  ],
  paths: {
    "/api/play/audit/{sessionId}": {
      get: {
        operationId: "readAuditSession",
        summary: "Read full audit timeline for a session",
        description:
          "Returns the entries array for the given sessionId. Set `?verify=1` to include `total/verified/tampered/hmacWired` counts. Public; no auth.",
        tags: ["audit"],
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            description: "Session id (8–64 chars, [A-Za-z0-9_-]).",
            schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" },
          },
          {
            name: "verify",
            in: "query",
            required: false,
            description: "If `1`, include HMAC verification counts.",
            schema: { type: "string", enum: ["1"] },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuditPayload" },
              },
            },
          },
          "400": { description: "Invalid sessionId format" },
        },
      },
    },
    "/api/play/audit/{sessionId}/csv": {
      get: {
        operationId: "exportAuditSessionCsv",
        summary: "Export audit timeline as RFC-4180 CSV with UTF-8 BOM",
        description:
          "Returns the entries for the given sessionId as CSV. Headers: ts, tool, governance, durationMs, errored, hmac, input, output. Designed for Excel/Sheets ingest by regulatory tooling.",
        tags: ["audit"],
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" },
          },
        ],
        responses: {
          "200": {
            description: "CSV file",
            content: {
              "text/csv": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/api/play/audit-stream/{sessionId}": {
      get: {
        operationId: "streamAuditSession",
        summary: "Server-Sent Events stream of new audit entries",
        description:
          "Returns `text/event-stream` with one `event: append` per new entry + `event: keepalive` every 30s. Use EventSource on the client to subscribe. Optional v1, recommended v1.1+ per RFC-004 § 5.",
        tags: ["audit"],
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" },
          },
        ],
        responses: {
          "200": {
            description: "Event stream",
            content: {
              "text/event-stream": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/api/badge/{sessionId}": {
      get: {
        operationId: "verificationBadge",
        summary: "Get an SVG verification badge for a session",
        description:
          "Returns a shields.io-style SVG showing the session's verify status. Suitable for embedding in READMEs, PRs, etc. ETag + Cache-Control set.",
        tags: ["badge"],
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" },
          },
        ],
        responses: {
          "200": {
            description: "SVG badge",
            content: {
              "image/svg+xml": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/api/discovery": {
      get: {
        operationId: "discovery",
        summary: "RFC-002 agent-discovery manifest",
        description:
          "Returns the discovery manifest (well-known agents.json shape) advertising this site's capabilities + audit endpoints + RFC conformance.",
        tags: ["discovery"],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/api/auto-incorporate": {
      post: {
        operationId: "autoIncorporate",
        summary: "Generate a sociedad-IA from form input",
        description:
          "Takes a description of a sociedad (denominacion, capital, objeto, representante) and returns a generated source-file pack + audit-log session id. Used by the /incorporar wizard. Rate-limited.",
        tags: ["incorporate"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/IncorporateInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Generation result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IncorporateResult" },
              },
            },
          },
          "400": { description: "Validation error" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/api/play": {
      post: {
        operationId: "runReferenceAgent",
        summary: "Run the reference agent against an input",
        description:
          "Executes the demo agent (Vercel AI SDK 6 Experimental_Agent) over the provided prompt + creates an audit-log session. Returns the sessionId + assistant response.",
        tags: ["demo"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  prompt: { type: "string" },
                  sessionId: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" },
                },
                required: ["prompt"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Agent run completed",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/api/play/tamper-demo": {
      post: {
        operationId: "tamperDemo",
        summary: "Inject a deliberately-tampered entry for verification demo",
        description:
          "Appends an entry whose HMAC does NOT match its canonical form, so the /verify page surfaces a tampered count > 0. Test-only; rate-limited.",
        tags: ["demo"],
        responses: {
          "200": { description: "OK" },
        },
      },
    },
  },
  components: {
    schemas: {
      AuditEntry: {
        type: "object",
        description: "RFC-004 v1 operational-log entry. See /rfcs/004.",
        required: ["id", "sessionId", "ts", "tool", "governance", "input", "hmac"],
        properties: {
          id: {
            type: "string",
            description: "Stable id. ISO-8601 UTC + nonce.",
            example: "2026-05-11T14:23:01.512Z-a1b2c3d4",
          },
          sessionId: {
            type: "string",
            pattern: "^[A-Za-z0-9_-]{8,64}$",
          },
          ts: { type: "string", format: "date-time" },
          tool: {
            type: "string",
            description: "Dotted tool path. E.g. mercadopago.preapproval.create.",
          },
          governance: {
            type: "string",
            enum: ["algorithm-only", "audit-logged", "mocked-upstream", "requires-confirmation"],
          },
          input: {},
          output: {},
          errored: { type: "boolean" },
          durationMs: { type: "integer" },
          hmac: {
            type: ["string", "null"],
            pattern: "^sha256:[0-9a-f]{64}$",
          },
        },
      },
      AuditPayload: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          entries: { type: "array", items: { $ref: "#/components/schemas/AuditEntry" } },
          total: { type: "integer" },
          verified: { type: "integer" },
          tampered: { type: "integer" },
          hmacWired: { type: "boolean" },
          backend: { type: "string", enum: ["vercel-kv", "in-memory"] },
        },
      },
      IncorporateInput: {
        type: "object",
        required: ["denominacion", "tipo", "capitalSocial", "objeto"],
        properties: {
          denominacion: { type: "string", minLength: 3, maxLength: 200 },
          tipo: { type: "string", enum: ["SAS", "SRL", "SA", "SOCIEDAD-IA"] },
          capitalSocial: { type: "integer", minimum: 1 },
          objeto: { type: "string", minLength: 20 },
          representante: {
            type: "object",
            properties: {
              nombre: { type: "string" },
              cuit: { type: "string", pattern: "^\\d{2}-\\d{8}-\\d$" },
            },
          },
          emailContacto: { type: "string", format: "email" },
          piezas: { type: "array", items: { type: "string" } },
          sessionId: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" },
        },
      },
      IncorporateResult: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(spec, {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
