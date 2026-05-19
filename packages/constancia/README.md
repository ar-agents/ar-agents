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
    "Necesito la constancia de inscripción del CUIT 20-41758101-5 para el alta de proveedor. Decime el régimen y guardá el PDF.",
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

## License

MIT © Nazareno Clemente
