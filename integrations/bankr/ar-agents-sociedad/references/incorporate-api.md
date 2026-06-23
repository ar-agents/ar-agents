# `/api/auto-incorporate` — input/output contract

Canonical endpoint: `POST https://ar-agents.ar/api/auto-incorporate`. Client: `@ar-agents/incorporate` (zero-dependency fetch wrapper; Node 20+, Edge, Workers, Deno, browser-with-CORS).

## Input (`IncorporateInput`)

| Field | Type | Notes |
|---|---|---|
| `denominacion` | string (3-200) | Corporate name. IGJ rejects reserved words (Nacional, Estatal, etc). |
| `tipo` | `"SAS" \| "SRL" \| "SA" \| "SOCIEDAD-IA"` | `SOCIEDAD-IA` is the AI-society regime (gated; see RFC-001 §3.4). |
| `capitalSocial` | number (ARS) | Minimum by tipo: SAS/SRL 100k, SA 30M, **SOCIEDAD-IA 1**. |
| `objeto` | string (20-2000) | Corporate purpose. Must be specific; IGJ rejects generic phrasing. |
| `representante` | `{ nombre, cuit }?` | Optional human attachment point for the legal-facade layer (RFC-001 §3.1; art. 88/92). This is the human-in-the-loop anchor. |

## Output (success)

- `ok: true`
- `files` — the four generated source files: `package.json`, `lib/agent.ts`, `.env.example`, `README.md`.
- `deploy.oneClickUrl` — Vercel one-click deploy for the generated society.
- env-var manifest required for production.
- legal + operational checklist.
- `audit` — `{ url, ... }` a signed audit-log reference (HMAC-SHA256). This is the public, recomputable proof-of-conduct ("verify, don't trust") and the supervisory trail.

## Output (validation failure)

- `ok: false`
- `validation.findings[]` — each `{ severity, field, message }`. Surface them to the user; do not retry blindly.

## Agent guidance

1. Default `tipo: "SOCIEDAD-IA"`, `capitalSocial: 1` for an autonomous agent.
2. Write a **specific** `objeto` (what the agent actually does); generic objects are rejected.
3. Include a `representante` when a human is available — it is the art. 102 / steward attachment point.
4. Present `deploy.oneClickUrl` and `audit.url`; never hide the audit reference.
5. Confirm the full output shape against the `@ar-agents/incorporate` README for the version you import (currently 0.2.0).
