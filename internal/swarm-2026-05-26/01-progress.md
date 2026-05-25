# Progress log — session of 2026-05-26

Companion to `00-master.md` (the 13-agent swarm synthesis). This file
captures everything that actually shipped + everything still pending,
so a fresh session can pick up cleanly.

## ar-agents catalog state

**31 packages on npm with SLSA provenance.** 28 of 31 share the
`@ar-agents/core` `ArAgentsError` contract.

| Package | Version | Notes |
|---|---|---|
| **`@ar-agents/aduana`** | **0.2.0** | NEW: ARCA Aduana — despacho lookup + NCM |
| `@ar-agents/agentic-commerce-bridge` | (pre-swarm) | NOT lifted — no dedicated errors module |
| **`@ar-agents/anses`** | **0.2.0** | NEW: CUIL status + family allowances + minimo |
| `@ar-agents/ap2` | (pre-swarm) | NOT lifted — no dedicated errors module |
| `@ar-agents/banking` | **0.5.0** | lifted to `@ar-agents/core` |
| `@ar-agents/banking-bcra` | **0.2.0** | lifted to `@ar-agents/core` |
| `@ar-agents/boletin-oficial` | **0.2.0** | lifted to `@ar-agents/core` |
| **`@ar-agents/cnv-emisor`** | **0.2.0** | NEW: CNV issuer disclosures (hechos relevantes) |
| `@ar-agents/constancia` | **0.2.0** | lifted to `@ar-agents/core` |
| `@ar-agents/core` | **0.1.0** | shared error + middleware + HITL |
| **`@ar-agents/dnrpa`** | **0.2.0** | NEW: vehicle plate lookups (browser-backed) |
| `@ar-agents/facturacion` | **0.4.0** | lifted to `@ar-agents/core` |
| `@ar-agents/firma-digital` | **0.2.0** | lifted to `@ar-agents/core` |
| `@ar-agents/gde-tad` | **0.3.0** | lifted to `@ar-agents/core` |
| `@ar-agents/identity` | **0.8.0** | lifted to `@ar-agents/core` |
| `@ar-agents/identity-attest` | **0.5.0** | lifted to `@ar-agents/core` |
| `@ar-agents/igj` | **0.2.0** | lifted to `@ar-agents/core` |
| `@ar-agents/iibb` | **0.4.0** | lifted + CM Articles 6 (construction), 8 (transport), 9 (professional services) |
| `@ar-agents/incorporate` | (pre-swarm) | not lifted — single-file package |
| **`@ar-agents/inpi`** | **0.2.0** | NEW: trademark registry search |
| `@ar-agents/iva-percepciones` | **0.2.0** | lifted to `@ar-agents/core` |
| `@ar-agents/iva-retenciones` | **0.2.0** | lifted to `@ar-agents/core` |
| `@ar-agents/mcp` | (pre-swarm) | NOT lifted — no dedicated errors module |
| `@ar-agents/mercadolibre` | **0.5.0** | lifted to `@ar-agents/core` |
| `@ar-agents/mercadopago` | **0.18.0** | lifted to `@ar-agents/core` (source of `core`'s primitives) |
| `@ar-agents/mi-argentina` | **0.2.0** | lifted to `@ar-agents/core` |
| `@ar-agents/shipping` | **0.3.0** | lifted to `@ar-agents/core` |
| `@ar-agents/sicore` | **0.2.0** | lifted to `@ar-agents/core` |
| `@ar-agents/suss` | **0.2.0** | lifted to `@ar-agents/core` (first AR payroll lib) |
| `@ar-agents/tienda-nube` | **0.2.0** | lifted to `@ar-agents/core` |
| `@ar-agents/uala` | **0.3.0** | lifted to `@ar-agents/core` |
| `@ar-agents/whatsapp` | **0.5.0** | lifted to `@ar-agents/core` |
| `@ar-agents/wscdc` | **0.2.0** | lifted to `@ar-agents/core` (factura validation) |

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
| ~~Lift identity → @ar-agents/core~~ | ✅ shipped as identity@0.8.0 | Family-coherence value of core demonstrated |
| ~~Same lift for uala + iibb + sicore + iva-*~~ | ✅ shipped (uala@0.3 + iibb@0.3 + sicore@0.2 + iva-percepciones@0.2 + iva-retenciones@0.2) | Batched as a single sweep, 127 tests pass |
| ~~Lift swarm-wave packages~~ | ✅ shipped (banking-bcra@0.2 + suss@0.2 + tienda-nube@0.2 + wscdc@0.2) | Family-coherence count: 10/26 |
| ~~Lift `@ar-agents/mercadopago`~~ | ✅ shipped as mercadopago@0.18 | Flagship package now on family contract; 328 tests pass; count: 11/26 |
| **Lift remaining OG packages** (whatsapp, facturacion, banking, mi-argentina, identity-attest, igj, gde-tad, firma-digital, boletin-oficial, constancia, mercadolibre, agentic-commerce-bridge, ap2, incorporate, mcp, shipping) | M-L (sweep) | Completes family-coherence (~15 packages remaining) |
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
