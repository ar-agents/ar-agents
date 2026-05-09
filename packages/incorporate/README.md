# @ar-agents/incorporate

> Zero-dependency TypeScript client for [`/api/auto-incorporate`](https://ar-agents.vercel.app/api/auto-incorporate). One async call → an Argentine sociedad-IA's full incorporation kit (generated source files, Vercel deploy URL, env-var manifest, legal checklist, signed audit-log reference).

[![npm version](https://img.shields.io/npm/v/@ar-agents/incorporate.svg)](https://www.npmjs.com/package/@ar-agents/incorporate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![SLSA v1](https://img.shields.io/badge/SLSA-v1-success)](https://slsa.dev)

## Why

When the AR sociedad-IA regime ships (anuncio Sturzenegger 28-abr-2026), an external agent (USA-LLC, ChatGPT, Claude, Gemini) should be able to spin up a properly-configured AR sociedad in one programmatic call — not by clicking through a wizard. This package is the canonical surface for that, designed to fit cleanly into any agent's tool list or any orchestration script.

The companion human-facing UI is at [/incorporar](https://ar-agents.vercel.app/incorporar). Same backend, same generated output.

## Install

```bash
pnpm add @ar-agents/incorporate
```

Zero runtime dependencies. Works in Node 20+, Edge Runtime, Cloudflare Workers, Deno, and browsers (with CORS).

## Quickstart

```ts
import { incorporate } from "@ar-agents/incorporate";

const result = await incorporate({
  denominacion: "ACME-AI SAS",
  tipo: "SOCIEDAD-IA",
  capitalSocial: 1,
  objeto: "Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
});

if (!result.ok) {
  for (const f of result.validation.findings) {
    console.error(`[${f.severity}] ${f.field}: ${f.message}`);
  }
  process.exit(1);
}

console.log("Slug:", result.sociedad.slug);
console.log("Deploy:", result.deploy.oneClickUrl);
console.log("Audit log:", result.audit.dashboardUrl);

// Persist the four generated files
await Promise.all(
  Object.entries(result.config).map(([path, content]) =>
    Deno.writeTextFile(`./out/${path}`, content), // or fs.writeFile in Node
  ),
);
```

## API

### `incorporate(input, options?): Promise<IncorporateResult>`

Returns either:

- `{ ok: true, sociedad, validation, config, envVars, checklist, deploy, audit, rfc001, generatedAt }` on success
- `{ ok: false, validation: { findings: [...] }, rfc001 }` on validation failure (HTTP 422)

Throws `IncorporateError` on network errors or unexpected HTTP statuses (5xx, 429, etc.). Validation failures are *not* exceptions — they're a normal outcome the calling agent should handle.

#### Input

```ts
{
  denominacion: string;           // 3-200 chars
  tipo: "SAS" | "SRL" | "SA" | "SOCIEDAD-IA";
  capitalSocial: number;          // ARS, > 0
  objeto: string;                 // 20-2000 chars
  representante?: { nombre: string; cuit: string };
  emailContacto?: string;
  piezas?: PiezaId[];             // optional subset; required pieces auto-merged
  sessionId?: string;             // for audit-log continuity
}
```

#### Options

```ts
{
  baseUrl?: string;               // defaults to https://ar-agents.vercel.app
  fetchImpl?: typeof fetch;       // for Node 18 polyfill / instrumented fetch
  signal?: AbortSignal;
  headers?: Record<string, string>;
}
```

### `incorporateOrThrow(input, options?): Promise<IncorporateSuccess>`

Same as `incorporate()` but throws `IncorporateValidationError` instead of returning a failure envelope.

### `describe(options?): Promise<unknown>`

Fetches `GET /api/auto-incorporate` — the endpoint's self-description (input schema, required piezas, RFC-001 link). Useful for capability discovery.

### `fetchAudit(sessionId, options?): Promise<unknown>`

Fetches the audit log for a session. Pass `{ verify: true }` to also request server-side HMAC verification.

## Audit log

Every incorporation request is recorded in a HMAC-SHA256-signed audit log persisted to Vercel KV (Upstash). The response includes:

```ts
result.audit = {
  sessionId: "uuid",
  backend: "vercel-kv" | "in-memory",
  entry: {
    id, sessionId, ts, tool: "auto_incorporate", governance: "audit-logged",
    input, output, hmac: "sha256:..."
  },
  url: "https://ar-agents.vercel.app/api/play/audit/{sessionId}",
  verifyUrl: "https://ar-agents.vercel.app/api/play/audit/{sessionId}?verify=1",
  dashboardUrl: "https://ar-agents.vercel.app/dashboard/{sessionId}",
};
```

`dashboardUrl` is the human-readable forensic timeline; `verifyUrl` is the JSON re-verification endpoint. RFC-001 § 9.2 covers the legal-probative-value contract.

## Multi-step orchestration

Pass the same `sessionId` across multiple `incorporate()` + `/api/play/*` calls to chain them under a single forensic timeline:

```ts
const sessionId = crypto.randomUUID();

const r1 = await incorporate({ ... , sessionId });
// later
const r2 = await incorporate({ ... , sessionId });

const audit = await fetchAudit(sessionId, { verify: true });
// audit.entries → all events from both calls in order
// audit.verification.tampered → 0 if log is clean
```

## Validation rules (server-side)

Mirror of `@ar-agents/gde-tad`'s `validate_igj_inscription` tool:

- Denominación: 3–200 chars, no IGJ-reserved words (Nacional / Estatal / Gobierno / Estado / Oficial)
- Capital: ≥ minimum for `tipo` (SAS/SRL: 100k ARS, SA: 30M ARS, SOCIEDAD-IA: 1 ARS)
- Objeto: 20–2000 chars, IGJ rejects generic phrasing (the 20-char floor is the conservative cutoff)
- Representante CUIT: 11 digits if provided

## Testing

```bash
pnpm --filter @ar-agents/incorporate test
```

Unit tests cover every code path with mocked `fetch` — no network in CI.

## License

MIT © Nazareno Clemente. SLSA v1 npm provenance attestation on every release.
