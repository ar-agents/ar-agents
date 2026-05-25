# Progress log — session of 2026-05-26

Companion to `00-master.md` (the 13-agent swarm synthesis). This file
captures everything that actually shipped + everything still pending,
so a fresh session can pick up cleanly.

## ar-agents catalog state

**25 packages on npm with SLSA provenance.** All currently at v0.1.0
unless noted; the four bumped to v0.2.0 were in-flight pre-swarm.

| Package | Version | Notes |
|---|---|---|
| `@ar-agents/agentic-commerce-bridge` | (pre-swarm) | |
| `@ar-agents/ap2` | (pre-swarm) | |
| `@ar-agents/banking` | (pre-swarm) | |
| **`@ar-agents/banking-bcra`** | **0.1.0** | NEW: credit check + risk band |
| `@ar-agents/boletin-oficial` | (pre-swarm) | |
| `@ar-agents/constancia` | (pre-swarm) | |
| **`@ar-agents/core`** | **0.1.0** | NEW: shared error + middleware + HITL |
| `@ar-agents/facturacion` | (pre-swarm) | |
| `@ar-agents/firma-digital` | (pre-swarm) | |
| `@ar-agents/gde-tad` | (pre-swarm) | |
| `@ar-agents/identity` | (pre-swarm) | needs lift to core (low-risk minor bump) |
| `@ar-agents/identity-attest` | (pre-swarm) | |
| `@ar-agents/igj` | (pre-swarm) | |
| `@ar-agents/iibb` | **0.2.0** | needs CM Articles 6–13 |
| `@ar-agents/incorporate` | (pre-swarm) | |
| **`@ar-agents/iva-percepciones`** | **0.1.0** | swarm wave |
| **`@ar-agents/iva-retenciones`** | **0.1.0** | swarm wave |
| `@ar-agents/mcp` | (pre-swarm) | |
| `@ar-agents/mercadolibre` | (pre-swarm) | |
| `@ar-agents/mercadopago` | (pre-swarm) | best-in-class DX; source of `core`'s primitives |
| `@ar-agents/mi-argentina` | (pre-swarm) | |
| `@ar-agents/shipping` | (pre-swarm) | |
| **`@ar-agents/sicore`** | **0.1.0** | swarm wave: Ganancias retentions |
| **`@ar-agents/suss`** | **0.1.0** | NEW: payroll / SICOSS — first AR lib |
| **`@ar-agents/tienda-nube`** | **0.1.0** | swarm wave: #2 AR e-commerce |
| `@ar-agents/uala` | **0.2.0** | swarm wave: InMemoryAdapter + refresh |
| `@ar-agents/whatsapp` | (pre-swarm) | |
| **`@ar-agents/wscdc`** | **0.1.0** | NEW: factura validation |

## Vultur repo state

Branch: `main` at commit `6517782` (latest pushed). Highlights:

- Customer HTTP API v1 (`/api/v1/health`, `/societies/:slug`,
  `/facturas` POST+GET+:id, `/usage`, `/events`, `/api-keys` CRUD,
  `/webhooks` CRUD, `/openapi.json`)
- Cockpit pages: `/dashboard/[slug]/api-keys`, `/changelog`,
  `/roadmap`, `/trust`, `/status`, `/docs`, `/api-explorer` (Redoc)
- `@vultur/sdk` v0.1.0 code complete in `packages/sdk/`, release
  workflow `.github/workflows/release-sdk.yml` waiting for NPM_TOKEN
- Subscription model now binds to Society OR Platform (migration
  `00000000000007_subscription_platform` applied to prod). The $399
  Platform tier now actually charges via `createPlatformCheckout`.
- Onboarding stepper: AFIP cert paste mandatory (real
  `SocietyCredential` row presence drives the green badge, not the
  legacy `BillingConnection.connected` boolean)
- Security: webhook HMACs timing-safe, sandbox unsigned-fallback
  gated by explicit env var, PEM bytes never logged on parse errors
- Email lifecycle wired: welcome, apiKeyCreated, paymentFailed,
  certExpiring (daily cron)

## Pending — Naza-only (need your credentials / voice)

1. **`@vultur/sdk@0.1.0` publish to npm.** Workflow committed at
   `.github/workflows/release-sdk.yml`. Steps:
   ```sh
   # generate npm token w/ @vultur scope write, then:
   pbpaste | gh secret set NPM_TOKEN --repo naza00000/vultur
   gh workflow run release-sdk.yml --repo naza00000/vultur
   ```

2. **Defensive npm squat orgs.** Stub package ready in
   `internal/squats/pkg/`. Create three free OSS orgs on npmjs.com
   (`ar-agent`, `ar.agents`, `ar_agents`), then loop publish per
   `internal/squats/README.md`. ~3 minutes total.

3. **Outreach Wave 2.** Five drafts in
   `outreach/2026-05-23-wave-2/` (Barbieri, Rauch, Reingart,
   Zamudio, Bearzi) + new top-30 in `00-master.md`.

4. **Working-group letter to Vía Libre + CETyS + Fundar.** Per
   swarm playbook agent: single highest-leverage move this week.
   Buys civil-society legitimacy hedging the regulator-pushback
   risk. Naza-voice + co-signature.

5. **Roomix → Gorriti DM** for the Rauch warm intro. AR-pride
   angle. The single highest-EV outreach action available.

6. **Press pitches.** Dergarabedian (iProfesional), swyx (Latent
   Space), Davidovsky (La Nación), De Toma (El Cronista),
   Cavalié (Startupeable), Daniela Dib (Rest of World).

7. **Speaker submissions.** Nerdearla 2026 CFP, AI Weekend BA
   (Jul 4–6).

## Pending — Claude-buildable (next session menu)

In rough order of leverage:

| Item | Effort | Leverage |
|---|---|---|
| **Lift identity → @ar-agents/core** | M (1 day, careful minor bump) | Demonstrates family-coherence value of core, elevates 1 of 18 lagging packages |
| **Same lift for uala + iibb + sicore + iva-*** | M each (~1 day each) | Same logic; could batch as a single sweep |
| **iibb v0.3 with CM Articles 6–13** | M-L | Closes the last federal tax-math gap (construction, transport, professional services special regimes) |
| **`@ar-agents/aduana`** | M-L | AFIP/ARCA Aduana (María); ARCA published new REST API in 2025 |
| **`@ar-agents/cnv-emisor`** | L | Comisión Nacional de Valores; issuer disclosures |
| **`@ar-agents/dnrpa`** | M | DNRPA automotive registry; vehicle lookups |
| **`@ar-agents/inpi`** | M | Trademark lookups |
| **`@ar-agents/anses`** | L | ANSES public services (Mi ANSES API) |
| **Vultur BCRA credit-check integration** | S | Wire `@ar-agents/banking-bcra` into cockpit — show risk band for any society's clients on factura emit |
| **Vultur 2FA on cockpit logins** | M | auth.ts integration |
| **Vultur customer billing dashboard** | M | Invoice history page + upcoming invoice preview |
| **`@vultur/cli`** | M | `npx vultur facturas list` etc. Reuses SDK. |

## Strategic context (from swarm)

- **Sociedades-IA bill enters Congress in June** (per swarm research
  agents). Press window for "this is the open infra the law requires"
  is closing. Every visible asset (RFCs, working-group letter, press
  pieces, gov DMs) should ship before the bill text drops.

- **The kill list** (swarm explicit "don't do" calls):
  - Don't frame ar-agents as "Sturzenegger's project"; always
    "Argentine OSS community's project Sturzenegger endorsed"
  - Don't cold-pitch ministers — build legitimacy three layers
    below them (Corvalán/UBA, ARCA technocrats, GCBA Innovación)
  - Don't accept Reseller / white-label asks
  - Don't try custom pricing for Pro/Platform tiers
  - Don't offer Free-tier SLA email support

## Files of interest for next session

- `internal/swarm-2026-05-26/00-master.md` — the strategic synthesis
- `internal/swarm-2026-05-26/01-progress.md` — this file
- `internal/squats/README.md` — defensive squat publish steps
- `outreach/2026-05-23-wave-2/` — drafted DMs awaiting Naza send
- `packages/core/src/` — the shared primitives, referenced for lifts
- `packages/mercadopago/src/middleware.ts` + `otel.ts` — the original
  rich primitives that `@ar-agents/core` codified

## Vultur file roadmap

When resuming Vultur work, the highest-impact next items per the
audit (15 items, items 6–15 still open):

- `/api/v1/audit/anchor` already runs daily (Ed25519 anchor); no
  change needed
- `/api/v1/billing` customer invoice history endpoint (~3 days)
- Sentry full integration (sourcemap upload via `@sentry/cli`) — the
  minimal `captureError` is in place at
  `apps/web/src/lib/observability.ts`
- AFIP cert expiry cron is wired (`/api/cron/cert-expiry`); just
  needs ARCA-to-AFIP rename audit
