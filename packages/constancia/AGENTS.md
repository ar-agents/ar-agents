# Agent guide — `@ar-agents/constancia`

This file is for *agents at runtime*. Tool selection, result shapes, error patterns, AR context.

## When to pick this lib

- The user needs the **official Constancia de Inscripción PDF** — alta de proveedor, KYC, expediente, licitación, "mandame el papel de AFIP".
- The user wants a CUIT's fiscal situation (régimen, monotributo categoría, impuestos, domicilio) **and no AFIP X.509 cert is provisioned** — this drives the PUBLIC form, no Clave Fiscal.

## Do NOT pick this lib when

- You only need the **data** (not the PDF) AND `@ar-agents/identity` is configured with an AFIP cert → use `@ar-agents/identity` `lookup_cuit_afip`. It is faster (SOAP, ~1s) and needs no browser. This tool is **seconds, not milliseconds**, and can fail transiently.
- You need to validate a CUIT's check digit → `@ar-agents/identity` `validate_cuit` (pure, instant). Always do this *before* `constancia_inscripcion` to avoid burning a browser run on a malformed CUIT.
- You need padrón monotributo history, ARCA resoluciones, or anything not on the constancia → that is not this lib.

## Tool selection

| User intent                                                                 | Tool                       |
| --------------------------------------------------------------------------- | -------------------------- |
| "Bajame / mandame la constancia de inscripción de AFIP del CUIT X"          | `constancia_inscripcion`   |
| "¿Este CUIT es monotributista? ¿Qué categoría?" (no cert configured)        | `constancia_inscripcion`   |
| "Necesito el PDF de AFIP para el alta de proveedor / la licitación"         | `constancia_inscripcion`   |
| "¿El CUIT 20-… es válido?" (well-formedness)                                | `@ar-agents/identity` `validate_cuit` first |
| Same data, AFIP cert IS configured, PDF not needed                          | `@ar-agents/identity` `lookup_cuit_afip`    |

## Result shape

```ts
// constancia_inscripcion → ConstanciaResult
{
  cuit: string,                 // bare 11-digit, normalized
  available: boolean,           // true ONLY if a constancia was produced
  error: string | null,         // actionable message when available:false
  data: {
    cuit: string,
    denominacion: string,       // apellido y nombre | razón social
    tipoPersona: "fisica" | "juridica",
    condicion: "monotributo" | "responsable_inscripto" | "exento" |
               "no_alcanzado" | "no_inscripto" | "desconocida",
    monotributoCategoria?: string,    // "A".."K" when condicion=monotributo
    domicilioFiscal?: { direccion?, localidad?, provincia?, codigoPostal? },
    actividades?: { codigo, descripcion, principal }[],
    impuestos?: { descripcion, desde? }[],
    fechaInscripcion?: string,        // YYYY-MM-DD
    estado?: string,
  } | null,
  pdf: {                        // the official artifact — null if not captured
    base64?: string,
    url?: string,
    codigoVerificador?: string,
  } | null,
  source: "browse-skill" | "mock" | "unconfigured",
}
```

The tool **never throws**. Always branch on `available`. When `false`, read `error` to the user and stop — do not retry in a loop (a browser run is expensive and ARCA throttles).

## Error patterns

| `error` prefix                | Meaning & next step                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `fetcher_not_configured` / "not configured" | `UnconfiguredConstanciaFetcher` in use. Tell the user the app owner must wire a browser runtime. |
| `invalid_cuit`                | CUIT is not 11 digits. Ask the user for a correct CUIT; validate with `@ar-agents/identity`.      |
| `cuit_not_found`              | CUIT is well-formed but **no figura inscripto en ARCA**. State that plainly; do not retry.        |
| `fetcher_unreachable`         | The browser run failed (ARCA down / blocked / timeout). Suggest retrying in a few minutes, once.  |
| `captcha_blocked`             | ARCA presented a captcha the runtime could not solve. Needs a Browserbase-verified session.       |
| `fetcher_unexpected_response` | ARCA changed the form. The package returned no data on purpose. Report on GitHub; do not guess.   |

## AR context

- The **Constancia de Inscripción** is the canonical proof of a taxpayer's fiscal status. Argentine companies require a counterparty's constancia before paying an invoice or onboarding a proveedor. It carries a **código verificador** ARCA can re-check — which is why the *PDF*, not just the data, is what flows demand.
- **ARCA** = ex-AFIP (renamed 2025, *Agencia de Recaudación y Control Aduanero*). The public form still lives under `afip.gob.ar`. Treat "AFIP" and "ARCA" as the same agency.
- **Monotributo categoría** ("A".."K") sizes a small taxpayer; it is on the constancia and is what most billing logic actually needs.
- This is the **public, no-Clave-Fiscal** path. It complements `@ar-agents/identity`'s authenticated SOAP path — same data, but this one also yields the document and needs no cert.

## What NOT to do

- DO NOT call `constancia_inscripcion` in a loop or for batches without throttling — every call is a real browser session. ARCA rate-limits and may captcha-block.
- DO NOT trust a user-supplied CUIT's check digit — validate with `@ar-agents/identity` `validate_cuit` *before* calling, so a typo doesn't cost a browser run.
- DO NOT tell the user ARCA has a JSON API for the constancia PDF — it does NOT (as of 2026-05). The document only exists via the form. Surface this honestly.
- DO NOT fabricate fields when `available:false` or `data:null`. A missing constancia is a fact to report, not a gap to fill.
- DO NOT screen-scrape ARCA from the browser/client side — CORS-blocked and triggers anti-bot. The skill runs the browser server-side / in Browserbase.
