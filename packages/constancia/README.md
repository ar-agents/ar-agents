# `@ar-agents/constancia`

> ARCA (ex-AFIP) **Constancia de Inscripción** — the official fiscal document, *including the PDF* — as a typed tool for AI agents on the Vercel AI SDK 6.

```bash
pnpm add @ar-agents/constancia ai zod
```

Part of the [`Arg`](https://ar-agents.ar) toolkit — open infrastructure for the Argentine AI agent jurisdiction.

## Why this exists

Every alta-de-proveedor, KYC, expediente, and licitación flow in Argentina asks for the *Constancia de Inscripción*: the stamped ARCA document that states a CUIT's régimen (monotributo + categoría / responsable inscripto / exento), domicilio fiscal, actividades and impuestos.

`@ar-agents/identity`'s `lookup_cuit_afip` returns the **data** via the SOAP padrón webservice — but it needs an X.509 cert, and it can **never** return the **PDF document**. There is no API for the PDF. The only source is a [public web form](https://www.afip.gob.ar/genericos/constanciainscripcion/) (no Clave Fiscal) that renders the constancia and prints it.

This package fills that gap: it drives that form via a browser runtime and returns **both** the parsed fields **and** the official PDF with its código verificador — behind a stable, typed, testable adapter contract.

It is a deliberately **quarantined browser-backed tier**: the package bundles **no browser** and **no Browserbase dependency**. The runtime is injected. The pure `@ar-agents/*` libs stay pure.

## When to use this vs `@ar-agents/identity`

| You need…                                                              | Use                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| The **PDF document** (KYC, expediente, alta de proveedor, licitación)  | **`@ar-agents/constancia`** (only source)      |
| The tax data, **no AFIP cert provisioned**                             | **`@ar-agents/constancia`** (public form)      |
| Just the tax data, **and an AFIP X.509 cert is configured**            | `@ar-agents/identity` `lookup_cuit_afip` (faster, no browser) |
| Check digit / CUIT well-formedness                                     | `@ar-agents/identity` `validate_cuit`          |

## Quick start

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  constanciaTools,
  BrowseSkillConstanciaFetcher,
} from "@ar-agents/constancia";

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: constanciaTools({
    fetcher: new BrowseSkillConstanciaFetcher({
      // Wire to however you run the `afip-constancia` skill (browse CLI,
      // a Browserbase Function, a queue worker). Must resolve with the
      // JSON the skill prints — see the skill's "Output contract".
      runSkill: (cuit) => runAfipConstanciaSkill(cuit),
    }),
  }),
  stopWhen: stepCountIs(4),
});

const { text } = await agent.generate({
  prompt:
    "Necesito la constancia de inscripción del CUIT 20-12345678-6 para el alta de proveedor. Decime el régimen y guardá el PDF.",
});
```

With no `fetcher`, the tool is **safe to call** and returns `available: false` with setup instructions (`UnconfiguredConstanciaFetcher`). Use `MockConstanciaFetcher` for tests/demos.

## The companion browser skill

The runbook that actually drives the ARCA form is published as the **`afip-constancia` skill** on [`browserbase/skills`](https://github.com/browserbase/skills) — installable into the `browse` CLI, OpenClaw, or Claude Code (`/plugin install browse@browserbase`). One artifact, two surfaces:

- **This npm package** — typed, testable, programmatic. For agents on the Vercel AI SDK.
- **The skill** — a procedural browser runbook. For any agent driving a real browser.

They share one JSON output contract (`parseSkillOutput`), so the seam is documented on both sides.

## Resilience model

ARCA changes the form without notice. `parseSkillOutput` is **conservative**: on a structural mismatch it throws `ConstanciaError("fetcher_unexpected_response")` rather than return wrong data; a "not registered" response maps to `cuit_not_found`. The tool itself **never throws** at the agent — failures come back as `available: false` with an actionable `error`.

Pin the package version. Watch the changelog. Report breakage on GitHub.

## Production storage

`BrowseSkillConstanciaFetcher` re-runs a browser every call. Constancias change rarely — cache by CUIT (a constancia is valid for the day it was issued; most flows accept a recent one). Implement `ConstanciaFetcher` against your store and fall back to the browser on a miss:

```ts
class CachedConstanciaFetcher implements ConstanciaFetcher {
  constructor(private store: KV, private live: ConstanciaFetcher) {}
  async getConstancia(cuit: string) {
    return (await this.store.get(cuit)) ?? this.live.getConstancia(cuit);
  }
}
```

## Hosted oracle + badge

You don't have to wire a fetcher to get value out of this. There is a free hosted
Constancia Oracle built on this exact package:

**https://ar-agents.ar/constancia**

Paste any CUIT, get an instant verdict. Two honest tiers:

- **Free, instant, no secret.** CUIT check-digit validation (mod-11) via
  `@ar-agents/identity`. No Clave Fiscal, no cert, no waiting on any padrón. This
  is always available, and it's what the badge below reflects.
- **Good-standing (premium).** The real ARCA constancia (régimen, monotributo /
  responsable inscripto / exento, impuestos, domicilio) via this package's
  SOAP / browser backends. It's wired and turns on when an ARCA fetcher is
  configured on the deployment. Until then the hosted oracle says so plainly and
  returns no verdict. It never fabricates good standing.

### Free lookup API

```bash
curl "https://ar-agents.ar/api/constancia/lookup?cuit=20-12345678-6"
# => { ok, result: { cuit, valid, formatted, personType,
#     goodStanding, verdictAvailable, reason, proofUrl, badgeUrl } }
```

`valid` (check digit) is always populated. `verdictAvailable` is `true` only when
a real ARCA verdict was produced; otherwise `reason` tells you why (e.g. the
premium fetcher isn't configured on that deployment).

### Shareable "Verificado por ar-agents" badge

Every CUIT gets a self-updating SVG badge and a public proof page. The badge
message is driven by the free mod-11 check digit, so it works with no secret and
is safe to embed anywhere you assert a CUIT is real (README, status page, alta de
proveedor, marketplace profile).

- Badge: `https://ar-agents.ar/api/constancia/badge/<CUIT>`
- Proof page: `https://ar-agents.ar/constancia/<CUIT>`

Example, using the demo CUIT `20-12345678-6`:

```md
[![constancia](https://ar-agents.ar/api/constancia/badge/20123456786)](https://ar-agents.ar/constancia/20123456786)
```

Renders as `constancia · válida` (green) for a valid check digit, or
`constancia · no válida` (red) otherwise. Strip the dashes in the URL: use the
11 bare digits (`20123456786`).

> Tiering, restated so nobody overclaims: the badge and the free lookup verify the
> CUIT **check digit** only. That confirms the number is well-formed, not that the
> taxpayer is in good standing. The ARCA good-standing verdict is the premium tier
> and only appears once an ARCA fetcher is configured.

## License

MIT © Nazareno Clemente
