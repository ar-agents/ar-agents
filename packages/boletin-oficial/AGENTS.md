# Agent guide — `@ar-agents/boletin-oficial`

This file is for *agents at runtime*. Tool selection, result shapes, error patterns, AR context.

## When to pick this lib

- The user asks about **what was published** in the Boletín Oficial — laws, decrees, ARCA/BCRA resoluciones, sociedades constitutions, public contracts, judicial notices.
- The user wants to **monitor** for keywords, organismos, or specific CUITs ongoing.
- A compliance app needs to **flag** a CUIT mentioned in any recent norma.
- The user pastes a BO detail URL or id and asks "what does this say?"

Do NOT pick this lib when:

- The user wants the *full text of a specific law that's already enacted* — that's better served by SAIJ or InfoLEG (no package for them yet).
- The user wants AFIP/ARCA padron data (CUIT → tax condition) — use `@ar-agents/identity`.
- The user wants to *publish* in the BO — that requires TAD/GDE access, no programmatic API exists.

## Tool selection

| User intent                                                            | Tool                       |
| ---------------------------------------------------------------------- | -------------------------- |
| "Buscá X en el BO"                                                     | `bo_search`                |
| "¿Qué publicó el BO hoy?" / "Resumen del día"                          | `bo_today`                 |
| "Mostrame la resolución 1234/2026" with id known                       | `bo_get_norma`             |
| "Avisame cuando publiquen algo de X"                                   | `bo_subscribe`             |
| "¿A qué estoy suscripto?"                                              | `bo_list_subscriptions`    |
| "Cancelá la suscripción Y"                                             | `bo_unsubscribe`           |

### Keyword vs CUIT vs organismo

For subscriptions, pick the LEAST broad criterion the user actually means:

- **CUIT** is exact — most precise. "Avisame cuando aparezca la empresa X" → cuit.
- **Organismo** is substring — "todo lo de ARCA" / "todo lo del BCRA" → organismo.
- **Keyword** is substring against title + body — broadest, most noise. Use sparingly.

Combine criteria when the user is specific: "decretos sobre monotributo de ARCA" → `{ organismo: "ARCA", keyword: "monotributo", tipo: "decreto" }`.

## Result shape

```ts
// bo_search and bo_today
{
  results: Norma[],     // up to 20 per page by default
  total?: number,
  nextCursor: string | null,
  source: "live" | "mock" | "unconfigured",
}

// Norma
{
  id: string,
  seccion: "primera" | "segunda" | "tercera" | "cuarta",
  tipo: "ley" | "decreto" | "resolucion" | "disposicion" | "comunicacion" |
        "decision_administrativa" | "sociedad" | "contratacion" | "edicto" | "otro",
  titulo: string,
  organismo?: string,
  numero?: string,
  fechaPublicacion: string,    // YYYY-MM-DD
  fechaNorma?: string,
  texto?: string,              // present on bo_get_norma; usually absent on bo_search
  cuitsMencionados?: string[], // heuristic — VALIDATE before acting on
  url: string,                 // canonical https://www.boletinoficial.gob.ar/...
}

// bo_get_norma
{ found: true, norma: Norma } | { found: false, id: string }

// bo_subscribe
{ ok: true, id: string, match: { ... } } |
{ ok: false, error: string }
```

## Error patterns

| Code                          | Meaning & next step                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `fetcher_not_configured`      | UnconfiguredBoFetcher in use. Switch to `LiveBoFetcher` to enable real lookups.       |
| `fetcher_unreachable`         | BO website is down or blocked. Retry in a few minutes; report if persistent.          |
| `fetcher_unexpected_response` | BO page structure changed. Update the package; report on GitHub.                      |
| `subscription_invalid`        | bo_subscribe was called with no match criteria. Ask the user what to monitor.         |

## AR context

- The Boletín Oficial is THE official record. If the government did something legally, it appears here. Same-day publication.
- **Sección Segunda** is where new sociedades appear — including, soon, *sociedades de IA* (Sturzenegger plan, April 2026). An agent that wants to watch the IA-sociedad ecosystem subscribes to `{ seccion: "segunda" }` + relevant keywords.
- **ARCA** (ex-AFIP) publishes resoluciones generales daily. Subscribe to `{ organismo: "ARCA" }` to monitor tax/customs changes.
- **BCRA** publishes Comunicaciones (A/B/C/P) — currency controls, banking norms. Subscribe with `{ organismo: "BCRA" }`.
- **DNU** (Decretos de Necesidad y Urgencia) appear in Primera as `decreto`. The Milei government has used many — high-impact subscriptions: `{ tipo: "decreto", keyword: "DNU" }`.

## What NOT to do

- DO NOT trust extracted CUITs without validating with `@ar-agents/identity`'s `validate_cuit`.
- DO NOT call `bo_search` in a loop to simulate streaming — use `bo_subscribe` and have your callback poll.
- DO NOT advise the user that the BO has a JSON API — it does NOT (as of 2026-05). Surface that limitation honestly.
- DO NOT screen-scrape the BO from the browser side. The package handles scraping server-side; client-side requests will be CORS-blocked and may trigger anti-bot defenses.
