# Roadmap

The ordered backlog for the north star (`docs/NORTH-STAR.md`), executed continuously per the autonomy contract (`docs/AUTONOMY.md`).

Item format: `### <id> <title>` followed by `status`, `priority` (P0 highest), `acceptance`. Agents take the topmost `ready` item they can verify. Humans reorder; agents do not change priorities, only statuses and new items at the bottom of the matching milestone.

## M0: Studio exists (idea to operating society, simulated)

### M0-1 apps/studio skeleton
- status: done (2026-07-08, PR #159)
- priority: P0
- acceptance: Next.js app in apps/studio builds, typechecks, has its own test script wired into CI like the other apps; deployed to a Vercel project; renders a chat-first UI.

### M0-2 Builder agent with hybrid model routing
- status: done (2026-07-08, PR #159)
- priority: P0
- acceptance: /api/agent streams a tool-calling agent conversation. Model routing: free/cheap coach model by default, stronger build model for generation steps, both via AI Gateway with OpenRouter free-route fallback; routing is config, not code. Graceful "not configured" response when no key env is present.

### M0-3 Accounts, metering, caps
- status: done (2026-07-08, PR #159)
- priority: P0
- acceptance: anonymous account minted on first visit (bearer token, KV-backed), every agent request records input/output tokens and model cost per account, free-tier caps enforced server-side with a clear over-cap response. Unit tests for meter math and cap enforcement.

### M0-4 Society creation orchestration
- status: done (2026-07-08, PR #159)
- priority: P0
- acceptance: from a completed spec conversation the agent can execute the existing rails end to end in LAW_STATUS=pre mode: generate the society scaffold, create the draft registry entry, run the certifier, surface the result. Every step visible in the UI with statuses.

### M0-5 Operating dashboard v1
- status: done (2026-07-08, PR #159)
- priority: P0
- acceptance: for a created society: status, good standing, pending approvals (approve/reject), audit log tail, kill switch. Reads the existing landing APIs; no new backend state.

### M0-6 Billing math (not charging yet)
- status: done (2026-07-08, PR #159; usage rollup + 5x price in /api/account and the dashboard card, tests in meter.test.ts)
- priority: P1
- acceptance: per-account monthly usage rollup with cost and 5x price, exposed in the dashboard as "what you would be billed once operational". No payment execution. Tests for the rollup.

### M0-7 Live conversation with a real model
- status: done (2026-07-08; OPENROUTER_API_KEY live, coach on nemotron-3-ultra-550b:free, gateway topped up; full streamed coaching conversation verified in production with usage counters recording)
- priority: P0
- acceptance: a full coach conversation streams against a real model in production, tool calls included, and the account usage counters move.

### M0-8 Supervised real constitution run
- status: done (2026-07-08, supervised; AR Agents Operaciones Sociedad Automatizada, registry id ar-agents-operaciones-sociedad-automatiz, the first productive-sociedad-ia entry; kill switch round-tripped live; kept deliberately as the dogfood society)
- priority: P0
- acceptance: one society constituted from studio end to end against the live incorporate-attested API, credentials received, dashboard operational against it; then the registry entry is cleaned up or kept deliberately.

## M1: A stranger can do it

### M1-1 Coach corpus
- status: ready
- priority: P1
- acceptance: distilled startup-judgment corpus (lean startup method, Paul Graham essay principles with links, gstack build practice) wired into the coach system prompt; corpus is markdown files in apps/studio, each with sources; no full copyrighted texts.

### M1-2 Web research tool for the agent
- status: ready
- priority: P1
- acceptance: the builder agent can run web searches and fetch pages to validate a market before recommending a build; results cited in-conversation.

### M1-3 Spanish-first UX pass
- status: ready
- priority: P1
- acceptance: es-AR is the default language end to end; English available. Copy follows the site's plain style.

### M1-4 Terminal path
- status: ready
- priority: P2
- acceptance: npx ar-agents (or the existing CLI surface) walks the same journey from a terminal, calling the same APIs.

### M1-6 Society runtime deploys from studio
- status: ready
- priority: P1
- acceptance: a constituted society's agent app (the sociedad-ia-starter scaffold with its generated env, SOCIETY_ID and gate token included) deploys to its own Vercel project from studio with one action, and the dashboard shows the deployment's health. This is the gap between "incorporated" and "operating".

### M1-5 First real external user creates a society
- status: blocked (needs a human to recruit the user)
- priority: P1
- acceptance: someone who is not the repo owner goes idea to operating simulated society without help; friction log becomes new roadmap items.

## M2: Operate for real

### M2-1 Billing activation via Mercado Pago
- status: blocked (money movement; owner decision)
- priority: P1
- acceptance: operational societies get a monthly MP charge of 5x token cost; entitlement pause on non-payment; reuses the existing MP subscription rails.

### M2-2 Society runtime hosting story
- status: ready
- priority: P2
- acceptance: documented, tested path for where a created society's agent app runs (own Vercel project per society vs hosted multi-tenant), with env provisioning steps automated where possible.

### M2-3 LAW_STATUS=live switch rehearsal
- status: ready
- priority: P2
- acceptance: a dry-run checklist plus tests proving the pre->live switch changes exactly the intended behaviors (real filings instead of simulation) with no other diffs.

## Maintenance (continuous, when nothing above is ready)

- Dependency updates within semver (Dependabot PRs: verify and merge).
- Untested API routes gain route-level tests (see apps/landing/test for patterns).
- Doc drift: README and docs against actual code behavior.
- Security posture: rate limits and auth on new routes match existing patterns.
