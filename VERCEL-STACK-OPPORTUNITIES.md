# Vercel stack: integration + distribution opportunities for ar-agents

Internal planning doc. Date: 2026-06-23.

Source: a deep-research sweep of recent Vercel launches. The run's automated
verification was knocked out by a transient API outage, so the five
highest-impact facts were re-checked by hand against vercel.com (see Sources).

## The lens

We rent commodity mechanisms (runtime, hosting, model routing, compute, storage,
distribution, auth) and never couple the moat (the Argentine integrations,
governance enforcement, the verifiable audit log, the legal binding, and the
cross-host portability of our tools) to a single vendor primitive. So: adopt more
Vercel at the commodity layers, refuse it at the moat layers.

## A. Integration opportunities (ranked)

### 1. Vercel Connect (public beta, 17-jun-2026)
Credential brokering: short-lived, task-scoped creds minted from the deployment's
OIDC identity, replacing long-lived stored tokens. Adapters `@vercel/connect/mcp`
and `@vercel/connect/ai-sdk`. Connectors: Slack, GitHub, Linear, Discord, Notion,
Salesforce, Figma, Snowflake.
- Ship: adopt the "no standing secret" pattern for the AR creds (`AFIP_KEY_PEM`,
  MP token, WhatsApp token); use Connect itself only for ancillary SaaS connectors.
- Unlock: an autonomous sociedad stops holding long-lived keys to the state.
- Effort: medium.
- Classification: **(a) adopt the PATTERN portably** (via OIDC Federation);
  **(c) AVOID** putting AFIP cert custody behind Connect-the-product. Connect is
  Vercel-only off-platform, and its native connectors do not cover AFIP/MP/Meta.

### 2. Vercel Services (GA 1-jul-2026)
Backend-only microservices, first-class; can host MCP servers, durable workflows,
queues, cron.
- Ship: host `@ar-agents/mcp` + the sociedad backend (morning cron, webhooks, audit
  writer) as a private (non-public) Service.
- Unlock: a managed, backend-only MCP endpoint; one less box to run.
- Effort: small-medium.
- Classification: **(a) adopt** — pure hosting, no moat coupling. Keep npx/stdio +
  self-host as fallbacks so the MCP stays portable.

### 3. x402-mcp (npm, available; USDC/Base default, protocol-agnostic, open)
Per-tool programmatic payments over MCP via `paidTool` / `createPaidMcpHandler()` /
`withPayment()`.
- Ship: a new optional rail (extend `agentic-commerce-bridge` / `ap2`) so sociedades
  can monetize tools (charge per AFIP padron / constancia call) and pay for external
  paid tools.
- Unlock: ar-agents in the global agent economy + a monetization surface.
- Effort: medium.
- Classification: **(a) adopt as an additive portable rail.** Nuance: the crypto
  rail is separate from the AR MP/AFIP rail (the regulated moat); do not conflate.

### 4. Workflow / WDK (open SDK, portable, no lock-in)
Durable execution that survives crashes/deploys and resumes exactly.
- Ship: wrap multi-step incorporations + the audit chain for exactly-once durability
  (later).
- Unlock: reliability for long, multi-step flows.
- Effort: medium.
- Classification: **(b) premature** now (no demonstrated reliability pain). Portable
  when we need it, so not a coupling risk.

### 5. Vercel Sandbox (GA 30-ene-2026)
Ephemeral Firecracker microVMs to run untrusted code.
- Classification: **(b) unnecessary** — our agents call typed tools, not arbitrary
  code. Revisit only if a sociedad runs generated or user-supplied code.

## B. Distribution opportunities (zero moat coupling, flagged separately)

### 1. Vercel template gallery listing for `apps/sociedad-ia-starter`
The starter already ships `vercel` template metadata (displayName, description,
framework, demoUrl, tags) + a deploy button + README + MIT license. It is
listing-ready. Remaining step is external: submit via the Vercel community
template-submission flow.
- Effort: near-zero in-repo + one external submission. Reach: every dev browsing
  AR / agent templates.

### 2. Marketplace "AI agents and services" native integration (category live 23-oct-2025)
List `@ar-agents/mcp` + the incorporation service as a native integration (unified
billing + observability; installs into a customer's project).
- Effort: medium. Per Vercel's integration docs this needs provider approval + an
  integration server with billing/provisioning endpoints (confidence: medium, not
  re-fetched firsthand). Reach: highest.

### 3. Vercel MCP / agent-tools directory
Make `@ar-agents/mcp` discoverable as agent tools.
- Effort: low-medium. Complements the eve skill-pack already in `integrations/eve`.

## Time-sensitive
- **Vercel Services GA 1-jul-2026 (~1 week):** decide whether the MCP/backend moves there.
- **Connect + eve are PUBLIC BETA:** integrate loosely (expect API churn); being an
  early integration is a visibility side benefit.
- **x402-mcp is available now.**

## Recommended sequencing
1. Distribution first (highest leverage, lowest risk): submit the template listing
   (in-repo work is done) and get `@ar-agents/mcp` into the MCP / agent-tools directory.
2. Evaluate Vercel Services for hosting the MCP + backend after 1-jul.
3. Treat Connect as a security upgrade: adopt the short-lived-cred PATTERN portably
   (OIDC Federation), not as a Vercel dependency for the AFIP key.
4. Scope x402-mcp as a separate agent-economy bet when ready.
- Avoid for now: WDK and Sandbox. Never put governance, audit, legal binding, or
  AFIP-cert custody behind a Vercel-only primitive.

## Sources (load-bearing items verified firsthand 2026-06-23)
- Vercel Connect: https://vercel.com/blog/introducing-vercel-connect , https://vercel.com/blog/agent-stack
- eve: https://vercel.com/blog/agent-stack , https://vercel.com/changelog/introducing-eve-an-open-source-agent-framework
- Vercel Services + Ship 2026: https://vercel.com/blog/vercel-ship-2026-recap
- x402-mcp: https://vercel.com/blog/introducing-x402-mcp-open-protocol-payments-for-mcp-tools
- Marketplace AI agents/services: https://vercel.com/blog/ai-agents-and-services-on-the-vercel-marketplace
- Template + integration submission: https://community.vercel.com/t/submitting-a-template/6016 , https://vercel.com/docs/integrations/create-integration/submit-integration

Confidence: A1–A3 and B1 verified firsthand. Sandbox GA date, WDK portability, and
the Marketplace provider requirements come from the research run's primary Vercel
sources (coherent, but not individually re-fetched).
