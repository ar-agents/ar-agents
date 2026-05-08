# Agent guide — `@ar-agents/igj`

For agents at runtime: tool selection, result shapes, error patterns, AR context.

## When to pick this lib

- The user asks **about** a sociedad/asociación/fundación argentina (does it exist, when was it constituted, who runs it).
- Compliance flows that need a **first-pass** check on a CUIT against IGJ records before deeper validation.
- Counterparty due-diligence in B2B onboarding.

Do NOT pick this lib when:

- The user needs **authoritative real-time verification** that an entity is currently active. The dataset is `muestreo` — incomplete and time-lagged. Direct them to the IGJ portal.
- The user wants taxpayer fiscal data (CUIT condition, monotributo) — that's `@ar-agents/identity`.
- The user wants the *content* of a balance — only filing metadata is in this dataset; the document itself lives in TAD/IGJ portal.

## Critical: surface the `coverageNote`

Every search result and every fetcher response carries a `coverageNote` describing data limitations (sample dataset, not real-time). When summarizing IGJ data to a user, **always include this caveat**. Failing to do so creates the false impression that "absence in the dataset = entity does not exist".

## Tool selection

| User intent                                                           | Tool                       |
| --------------------------------------------------------------------- | -------------------------- |
| "Buscá ACME S.A." / "encontrá una SAS / fundación con CUIT X"         | `igj_search_entities`      |
| "Mostrame el detalle de la entidad #42"                               | `igj_get_entity`           |
| "¿Dónde está domiciliada esta sociedad?"                              | `igj_get_domicilios`       |
| "¿Quiénes son los directores?"                                        | `igj_get_autoridades`      |
| "¿Cuándo presentó el último balance?"                                 | `igj_get_balances`         |
| "¿Qué asambleas hizo este año?"                                       | `igj_get_asambleas`        |

## Result shape

```ts
// igj_search_entities
{
  results: IgjEntity[],
  total?: number,
  nextCursor: string | null,
  source: "live" | "mock" | "unconfigured",
  coverageNote: string,  // ALWAYS surface
}

// IgjEntity
{
  id: string,
  nombre: string,
  cuit?: string,           // 11 bare digits, normalized
  tipoEntidad: "sa" | "srl" | "sas" | "asociacion_civil" | "fundacion" | ...,
  fechaInscripcion?: string,  // YYYY-MM-DD
  matricula?: string,
}

// igj_get_entity
{ found: true, entity: IgjEntity } | { found: false, id: string }
```

## Error patterns

| Code                          | Meaning & next step                                                              |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `fetcher_not_configured`      | UnconfiguredIgjFetcher in use. Switch to `LiveCkanFetcher` to enable real lookups. |
| `ckan_unreachable`            | datos.jus.gob.ar is down / blocked. Retry in a few minutes.                      |
| `ckan_invalid_response`       | CKAN action returned `success: false`. Often: stale resource id (override via `resourceIds`). |
| `entity_not_found`            | Entity id is unknown. Suggest the user `igj_search_entities` first.              |

## AR context for non-AR agents

- **IGJ** = Inspección General de Justicia, Argentina's national registry for sociedades + non-profits headquartered in CABA + sociedades extranjeras. Provincial registries (DGRJ, etc.) handle sociedades headquartered in their province — IGJ doesn't cover them.
- **Tipo SA** is the Argentine Sociedad Anónima — closest analog to a Delaware C-Corp. **SAS** (Sociedad por Acciones Simplificada) was introduced 2017, growing fast. **SRL** = Sociedad de Responsabilidad Limitada (LLC).
- **Sociedades de IA** — proposed 2026 (Sturzenegger plan) — would be a NEW tipo. This dataset doesn't carry them yet because the legal framework hasn't passed.
- **CUIT** in IGJ records is sometimes missing for older registrations (pre-2010) or for foreign entities. Don't error when `cuit` is undefined; ask the user for additional context.
- **Provincias other than CABA**: this dataset doesn't cover them. If the user asks about a sociedad headquartered in, say, Mendoza, surface the limitation.

## Performance / cost

- All calls hit `datos.jus.gob.ar` directly. No auth, public endpoint.
- Latency: 200-700ms per CKAN request typical. No CDN.
- Rate limit: ~60 requests/minute observed. Don't loop unbounded.

## What NOT to do

- DO NOT cache `coverageNote` away from results — it must always travel together.
- DO NOT use the dataset as evidence of "this entity does NOT exist" — it's a sample.
- DO NOT try to reach IGJ's portal scraper — there's no documented API and the portal has anti-bot defenses. Use TAD-based flows for live verification (separate lib, not yet shipped).
