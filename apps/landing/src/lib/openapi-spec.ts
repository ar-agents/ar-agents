/**
 * Shared OpenAPI 3.1 spec for the public ar-agents API surface.
 *
 * Single source of truth imported by BOTH `/api/openapi` (JSON) and
 * `/api/openapi.yaml` (YAML). The YAML route used to HTTP-fetch the JSON
 * route from an origin derived from the request URL, which is a Host-header
 * SSRF vector (DeepSec). Sharing the object removes the round trip entirely.
 */

export const SITE = "https://ar-agents.ar";

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "ar-agents public API",
    summary:
      "Public endpoints for the AR sociedad-IA reference implementation: discovery, demo agent, audit-log read + verify + export + stream, badge, auto-incorporate wizard.",
    description:
      "The endpoints below are all unauthenticated + idempotent in their default verbs (GET). POST endpoints are explicitly marked; some are rate-limited. The audit-log endpoints implement RFC-004 v1; the discovery endpoint implements RFC-002 v1; the auto-incorporate endpoint implements the wizard backing RFC-001 § 6.\n\nMachine-readable schema. Source: https://ar-agents.ar/api/openapi",
    version: "1.0.0",
    contact: {
      name: "Nazareno Clemente",
      email: "naza@naza.ar",
      url: "https://ar-agents.ar",
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
    "/api/audit-summary/{sessionId}": {
      get: {
        operationId: "auditSummary",
        summary: "Aggregated stats for a session (governance, latency quantiles, anomalies)",
        description:
          "Lightweight live computation of recipe-25 aggregates over a single session: governance breakdown, tool usage, latency quantiles per-tool, anomaly flags (clock-skew, governance-shift, llm-error-without-fallback, missing-hmac), HMAC verification counts.",
        tags: ["audit"],
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" },
          },
        ],
        responses: { "200": { description: "Summary JSON", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },
    "/api/cert-badge": {
      get: {
        operationId: "certBadge",
        summary: "Live shields.io-style SVG badge with RFC-002+004 score for any URL",
        description:
          "Returns an embeddable SVG badge showing the live conformance score + rating for the target URL. Calls /api/certifier under the hood. Cached 60s.",
        tags: ["badge"],
        parameters: [
          { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" } },
          { name: "sessionId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "SVG", content: { "image/svg+xml": { schema: { type: "string" } } } } },
      },
    },
    "/api/openapi.yaml": {
      get: {
        operationId: "openApiYaml",
        summary: "YAML mirror of the OpenAPI 3.1 schema",
        description: "Same content as /api/openapi but serialized as YAML. For codegen / Swagger UI / Postman.",
        tags: ["discovery"],
        responses: { "200": { description: "YAML", content: { "application/yaml": { schema: { type: "string" } } } } },
      },
    },
    "/api/certifier": {
      get: {
        operationId: "certifyUrl",
        summary: "Score a URL 0-100 against RFC-002 + RFC-004 + RFC-005 (~11 checks)",
        description:
          "Runs HTTP fetches against the target's /.well-known/agents.json, audit endpoints, OpenAPI, etc. Honors rfcConformance claims (skip vs fail). Returns a Certification JSON with per-check breakdown.",
        tags: ["discovery"],
        parameters: [
          { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" } },
          { name: "sessionId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Certification JSON", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },
    "/api/registry/good-standing": {
      get: {
        operationId: "registryGoodStanding",
        summary: "Public good-standing oracle, the JUDGED leg of the born/operate/judged lifecycle",
        description:
          "Resolve an automated company by url, id, or cuit and get a small Ed25519-signed, offline-verifiable answer about its good standing before transacting. The signature is convenience; the load-bearing trust is the target's own forwarded public anchor. Forming and stale entries are returned as explicitly non-attesting.",
        tags: ["discovery"],
        parameters: [
          { name: "url", in: "query", required: false, schema: { type: "string", format: "uri" } },
          { name: "id", in: "query", required: false, schema: { type: "string" } },
          { name: "cuit", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Signed good-standing answer { body, sig, publicKey }", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },
    "/api/registry": {
      get: {
        operationId: "registryList",
        summary: "Machine-readable registry list",
        description:
          "List registry entries, filterable by jurisdiction, type, status. No auth, cacheable.",
        tags: ["discovery"],
        parameters: [
          { name: "jurisdiction", in: "query", required: false, schema: { type: "string" } },
          { name: "type", in: "query", required: false, schema: { type: "string" } },
          { name: "status", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Registry list JSON", content: { "application/json": { schema: { type: "object" } } } } },
      },
      post: {
        operationId: "registrySelfList",
        summary: "Self-list an entity in the registry",
        description:
          "Mints a write-once owner token. The entry starts unverified and auto-flips to active only when the certifier scores its declared URL high enough. Rate-limited.",
        tags: ["discovery"],
        responses: { "200": { description: "Created entry + owner token JSON" }, "429": { description: "Rate limited" } },
      },
    },
    "/api/conformance-history": {
      get: {
        operationId: "conformanceHistoryRead",
        summary: "KV-backed time-series of cert scores for a URL",
        description:
          "Returns the 365-entry capped history per URL. Pass ?refresh=1 to run the certifier first + append a new point. 90-day TTL.",
        tags: ["discovery"],
        parameters: [
          { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" } },
          { name: "refresh", in: "query", required: false, schema: { type: "string", enum: ["1"] } },
        ],
        responses: { "200": { description: "History JSON", content: { "application/json": { schema: { type: "object" } } } } },
      },
      post: {
        operationId: "conformanceHistoryAppend",
        summary: "Run the certifier + append a new point to the URL's history",
        tags: ["discovery"],
        parameters: [
          { name: "url", in: "query", required: false, schema: { type: "string", format: "uri" } },
        ],
        responses: { "200": { description: "Updated history JSON" } },
      },
    },
    "/api/auto-monitor": {
      get: {
        operationId: "autoMonitor",
        summary: "Daily Vercel cron, poll all /registro entries + populate conformance-history",
        description:
          "Runs the certifier against each live /registro URL + appends each result to its conformance-history. Optional CRON_SECRET auth.",
        tags: ["discovery"],
        responses: { "200": { description: "Run summary JSON" } },
      },
    },
    "/api/rfc-003-envelope": {
      get: {
        operationId: "rfc003Envelope",
        summary: "Generate the RFC-003 cross-jurisdictional audit envelope for a session",
        description:
          "Wraps the session's RFC-004 entries with RFC-003 issuer metadata + optional externalReferences to a counterpart. 30-day expiry.",
        tags: ["audit"],
        parameters: [
          { name: "sessionId", in: "query", required: false, schema: { type: "string" } },
          { name: "counterpart", in: "query", required: false, schema: { type: "string" } },
          { name: "counterpartSession", in: "query", required: false, schema: { type: "string" } },
          { name: "linkType", in: "query", required: false, schema: { type: "string", enum: ["ap2-mandate", "acp-checkout", "mcp", "manual"] } },
        ],
        responses: { "200": { description: "Envelope JSON" } },
      },
    },
    "/api/stats": {
      get: {
        operationId: "stats",
        summary: "Aggregate live stats (npm, GitHub, artifact counts, conformance)",
        description:
          "Single JSON with npm download counts, GitHub stars/forks, RFC + schema + test-vectors + recipe + test-file counts, plus live cert score and count of sociedades at 100/100. Cached 6h.",
        tags: ["discovery"],
        responses: { "200": { description: "Stats JSON" } },
      },
    },
    "/.well-known/agents.json": {
      get: {
        operationId: "agentsManifest",
        summary: "RFC-002 v1 discovery manifest",
        description: "issuer + endpoints + rfcConformance + auditEndpoints, agents.md-v1 compatible.",
        tags: ["discovery"],
        responses: { "200": { description: "Manifest JSON" } },
      },
    },
    "/.well-known/sociedad-ia/verify-key": {
      get: {
        operationId: "verifyKey",
        summary: "RFC-004 § 5 challenge-response HMAC key-possession proof",
        description:
          "Send a 16-128 hex challenge; server returns HMAC-SHA256(secret, challenge) as response + a stable keyFingerprint. Proves the server holds the AUDIT_HMAC_SECRET without revealing it.",
        tags: ["audit"],
        parameters: [
          { name: "challenge", in: "query", required: true, schema: { type: "string", pattern: "^[0-9a-fA-F]{16,128}$" } },
        ],
        responses: { "200": { description: "Challenge-response JSON" } },
      },
    },
    "/.well-known/sociedad-ia/keys": {
      get: {
        operationId: "keys",
        summary: "RFC-005 § 4 Ed25519 public-keys publication",
        description: "Returns the sociedad-IA's Ed25519 public keys (SPKI base64url + raw hex) with keyId + validFrom/validUntil.",
        tags: ["audit"],
        responses: { "200": { description: "Keys JSON" } },
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
