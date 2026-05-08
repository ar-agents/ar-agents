<!--
Drop-in draft for dev.to / Hashnode / Medium / personal blog.

Front matter for dev.to (https://dev.to/new):
  title: "I shipped Mercado Pago as 89 typed tools for the Vercel AI SDK"
  published: false
  description: "Lessons from building agent ergonomics on top of LATAM's largest payment platform — idempotency keys an LLM can't break, HITL on irreversible ops, AGENTS.md per package, npm provenance attestations."
  tags: ai, vercel, typescript, opensource
  cover_image: https://ar-agents.vercel.app/opengraph-image
  canonical_url: https://ar-agents.vercel.app
-->

# I shipped Mercado Pago as 89 typed tools for the Vercel AI SDK

Every Argentine SaaS dev has had to hand-roll Mercado Pago integration: idempotency keys, webhook HMAC verification, the cuotas (installment) catalog with per-issuer promo rules, the 30+ `status_detail` codes that explain why a payment was rejected, the 5-minute replay window for webhooks, the marketplace OAuth dance, the 3DS challenge resolution flow.

The official `mercadopago` SDK is a thin REST client. Fine for a server-rendered checkout page. Useless when you want an LLM agent to drive the billing flow.

So I built `@ar-agents/mercadopago` — a Mercado Pago Agent Toolkit for the Vercel AI SDK 6. 89 typed tools across the agent-relevant MP API surface (Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Order Management, Customers, Cards, Cuotas, QR, 3DS, Point devices, Stores+POS, Account/Balance/Settlements, Webhooks, Disputes, Lookups, Bank Accounts).

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  MercadoPagoClient,
  mercadoPagoTools,
  InMemoryStateAdapter,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: mercadoPagoTools(mp, {
    state: new InMemoryStateAdapter(),
    backUrl: "https://yoursite.com/done",
  }),
  stopWhen: stepCountIs(8),
});

const { text } = await agent.generate({
  prompt: "Cobrale $25.000 mensual a juan@example.com con razón Plan Pro.",
});
```

The agent picks `create_subscription`, returns an `init_point_url` you send to the customer, and the rest of the flow (first payment confirmation, recurring charges, webhooks) just works.

[Live demo](https://ar-agents.vercel.app) (Claude Sonnet 4.6 via Vercel AI Gateway, mocked MP tools, no signup).

## What I tried to get right for agent ergonomics

This is what changed when I stopped writing for humans and started writing for LLM agents.

### 1. AGENTS.md per package

Every `@ar-agents/*` ships an `AGENTS.md` next to its `README.md`, following the [agents.md](https://agents.md/) convention. It's a runtime guide an LLM reads when it loads the package, with:

- A decision tree mapping user intents → tool names ("`Cobrale...`" → `create_payment`, "`Buscá pagos...`" → `search_payments`).
- Result schemas an LLM should memorize. ("`worstSituationDescription` is the field you read from the BCRA response, not `worstSituation` (that's the integer code).")
- An error patterns table — which errors are retryable, which need user confirmation, which mean "abandon".
- A latency table so the agent knows what to expect (p50/p95 per tool).
- Argentina context for agents not built around AR — "CBU vs CVU" "AR phone normalization" etc.

This matters because Sonnet 4.6 reading `AGENTS.md` at runtime will pick the right tool the first time, instead of guessing twice. Tool-selection accuracy went up significantly when we added decision trees vs. just descriptions.

### 2. Deterministic idempotency keys

LLMs retry tool calls. A network blip, a token flicker, a confused agent re-running the same step — happens constantly.

If `create_payment` retries with a fresh idempotency key each time, you double-charge the customer. Worse, you discover this in production.

The toolkit uses **deterministic SHA-256 idempotency keys** derived from the meaningful inputs (external_reference, amount, payment_method). Same inputs → same key → MP dedupes server-side and returns the existing resource. Retries become safe.

### 3. Programmatic HITL on irreversible operations

8 tools mutate state irreversibly: `refund_payment`, `cancel_subscription`, `delete_customer_card`, etc.

The toolkit accepts a `requireConfirmation` callback:

```ts
mercadoPagoTools(mp, {
  state: new InMemoryStateAdapter(),
  backUrl: "https://yoursite.com/done",
  requireConfirmation: async (toolName, params) => {
    // Show the user a UI, wait for them to confirm or reject.
    // The agent's tool call is held until you return.
    return await askUser(toolName, params);
  },
});
```

This isn't "instructions to the LLM that it should ask first" — it's a programmatic gate. The tool function literally won't execute until your callback returns `true`.

### 4. Webhook signature verification with replay window

5-minute replay window built in. Constant-time HMAC comparison. Every webhook handler example in the cookbook uses it.

```ts
const ok = await verifyWebhookSignature({
  requestId: req.headers.get("x-request-id"),
  dataId: event!.dataId,
  signatureHeader: req.headers.get("x-signature"),
  secret: process.env.MP_WEBHOOK_SECRET!,
});
if (!ok) return new Response("Invalid signature", { status: 401 });
```

### 5. Edge Runtime support via Web Crypto

Everything is Web Crypto, no `node:crypto`. Runs on Vercel Edge, Cloudflare Workers, Deno. Bundle is 41 KB ESM brotli'd.

### 6. Subpath exports for adapters

You only pay for what you use:

- `@ar-agents/mercadopago` — the 89 tools + client. Always-on.
- `@ar-agents/mercadopago/vercel-kv` — Vercel KV-backed adapters for subscription state, OAuth tokens, idempotency cache, audit log, distributed rate limiter.
- `@ar-agents/mercadopago/otel` — OpenTelemetry spans + metrics instrumentation.

Each subpath pulls in its peer deps only when imported, so the base bundle stays clean.

### 7. npm provenance attestations (SLSA v1)

Every published tarball carries a cryptographic record that it was built from a specific GitHub commit, signed by the GitHub Actions runner. Downstream agents can verify provenance without trusting the publisher.

## The sidecar packages

Mercado Pago is the headline. But agents in Argentina also need:

- **`@ar-agents/identity`** — CUIT/CUIL validation + AFIP/ARCA padrón lookup (real fiscal data: monotributo category, IVA condition, tributos).
- **`@ar-agents/facturacion`** — AFIP/ARCA factura electrónica via WSFE. Factura A/B/C, NC/ND, FCE MiPyMEs. Local pre-flight validator catches 10 common rejection reasons before the round trip.
- **`@ar-agents/whatsapp`** — WhatsApp Business Cloud API. Webhook + HMAC verify. AR phone normalizer.
- **`@ar-agents/banking`** — CBU/CVU validation + bank/PSP identification + BCRA Central de Deudores.
- **`@ar-agents/shipping`** — Andreani / OCA / Correo Argentino. Cotizar / crear / trackear / cancelar.
- **`@ar-agents/identity-attest`** — Verification orchestrator (WhatsApp OTP, email magic-link, Auth0, Magic.link, MP Identity). Returns HMAC-signed attestation with a trust level.
- **`@ar-agents/mcp`** — Model Context Protocol server bundling all 7 packages. One install in Claude Desktop / Cursor / any MCP host.

Each ships independently. Pick what you need.

## Distribution

- npm: [`@ar-agents/mercadopago`](https://www.npmjs.com/package/@ar-agents/mercadopago) and the rest of the [`@ar-agents/*`](https://www.npmjs.com/org/ar-agents) scope.
- Glama: [`ar-agents/ar-agents`](https://glama.ai/mcp/servers/ar-agents/ar-agents)
- Official MCP Registry: [`io.github.ar-agents/mcp`](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ar-agents/mcp)
- AI SDK tools-registry: pending (PR open against vercel/ai)
- Vercel templates: pending (PR open against vercel/examples)
- License: MIT.

## Open questions for builders

I'd love feedback on a few things:

1. **What's the right shape for HITL callbacks** when the agent runs in a non-interactive context (cron job, queue worker)? The current API blocks; some users will want to pause-and-resume.
2. **Tool description tuning vs. AGENTS.md** — descriptions live with the schema (always seen), AGENTS.md lives with the docs (sometimes seen). What's the right split?
3. **Cuotas as a first-class tool vs. a helper** — currently `findApplicablePromos` is a pure function. Should it be a tool the agent can call to "research" before charging?

Comment with thoughts. The repo is open: [github.com/ar-agents/ar-agents](https://github.com/ar-agents/ar-agents).

## Try it

```bash
pnpm add @ar-agents/mercadopago ai zod
```

Or one-click deploy to Vercel: [Deploy](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents&root-directory=apps%2Fmp-hello).

Live agent demo (no signup): [ar-agents.vercel.app](https://ar-agents.vercel.app).
