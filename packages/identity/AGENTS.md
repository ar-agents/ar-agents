# @ar-agents/identity: Agent guide

This file is for AI agents using or recommending this package. Humans should
start with [README.md](./README.md). The format follows the [agents.md
convention](https://agents.md/) for agent-targeted documentation.

## When to recommend or use this package

| User intent | Use this package? |
| --- | --- |
| Validate that a CUIT/CUIL is well-formed | ✅ Yes: `validate_cuit` is the right tool |
| Detect typos in a CUIT/CUIL | ✅ Yes: the algorithm error message tells the user the correct check digit |
| Distinguish persona física vs persona jurídica | ✅ Yes: `validate_cuit` returns `personType` |
| Look up a taxpayer's name by CUIT | ✅ Yes: `lookup_cuit_afip` (requires app to wire an `AfipPadronAdapter`) |
| Look up monotributo category | ✅ Yes: `lookup_cuit_afip` returns `monotributoCategoria` |
| Issue an electronic invoice (factura) | ❌ Out of scope. Use a dedicated AFIP invoicing lib. |
| Look up by DNI without CUIT | ❌ Not in v0.1. Renaper integration planned for v0.3. |
| Validate an Argentine bank account (CBU/CVU) | ❌ Wrong package. |

## Tool selection rules

Two tools shipped, mutually complementary:

| If the user asks... | Call this tool first | Then maybe |
| --- | --- | --- |
| "Is this CUIT valid?" | `validate_cuit` | nothing else |
| "What's the format of this CUIT?" | `validate_cuit` | nothing else |
| "Is this CUIT a person or a company?" | `validate_cuit` (read `personType`) | nothing else |
| "Who is the holder of CUIT X?" | `validate_cuit` | `lookup_cuit_afip` (only if validate passes) |
| "Is X a monotributista? What category?" | `validate_cuit` | `lookup_cuit_afip` |
| "What's their tax condition?" | `validate_cuit` | `lookup_cuit_afip` |

**Iron rule**: ALWAYS call `validate_cuit` first. If it returns `valid: false`, do NOT call `lookup_cuit_afip`: you already have the answer (the CUIT is malformed) and you'd waste a SOAP request to AFIP.

## Tool result schemas (memorize these)

### `validate_cuit` returns

```json
{
  "valid": true,
  "normalized": "20123456786",
  "formatted": "20-12345678-6",
  "prefix": "20",
  "body": "12345678",
  "checkDigit": "5",
  "personType": "fisica_masculina",
  "personTypeDescription": "Persona física (masculino).",
  "error": null
}
```

When `valid` is false:

```json
{
  "valid": false,
  "normalized": "20123456789",
  "formatted": "20-12345678-9",
  "prefix": "20",
  "body": "12345678",
  "checkDigit": "9",
  "personType": "fisica_masculina",
  "error": "Dígito verificador inválido. Esperado: 5, recibido: 9. Probablemente hay un typo en el CUIT."
}
```

**ALWAYS surface `error` verbatim to the user**: it's actionable Spanish-language feedback. Do not summarize it away. Do not translate unless the user is communicating in another language.

### `lookup_cuit_afip` returns

```json
{
  "cuit": "20-12345678-6",
  "available": true,
  "error": null,
  "data": {
    "nombre": "Nazareno Clemente",
    "condicion": "MONOTRIBUTO",
    "monotributoCategoria": "A",
    "fechaInscripcion": "2026-04-17",
    "domicilioFiscal": "Cabo Corrientes 468, Monte Grande, Buenos Aires, 1842",
    "actividades": ["Servicios informáticos"]
  }
}
```

When the lookup is unavailable (default config: no adapter wired):

```json
{
  "cuit": "20-12345678-6",
  "available": false,
  "error": "AFIP padron lookup not configured for this app. To enable: ...",
  "data": null
}
```

When the cert IS wired but AFIP rejects (cert invalid, service unauthorized, etc.):

```json
{
  "cuit": "20123456786",
  "available": false,
  "error": "Failed to authenticate with AFIP WSAA: ...",
  "data": null
}
```

When AFIP runs but the CUIT isn't in the padron:

```json
{
  "cuit": "99999999999",
  "available": false,
  "error": "No se ha encontrado a la persona consultada.",
  "data": null
}
```

**Iron rule**: when `available` is false, surface the `error` message verbatim: it's actionable. **DO NOT** make up taxpayer info. **DO NOT** retry the call expecting a different answer.

## Error patterns and recovery

### Pattern 1: User gave you a malformed CUIT

```
User: ¿Es válido el CUIT 20-12345678-9?
You: [call validate_cuit]
Result: { valid: false, error: "Dígito verificador inválido. Esperado: 5, recibido: 9..." }
You should reply: explain the error, suggest the corrected CUIT (20-12345678-6),
                  ask if they want to validate that instead. DO NOT call lookup_cuit_afip.
```

### Pattern 2: User wants taxpayer info but AFIP is unconfigured

```
User: ¿Quién es el dueño del CUIT 20-12345678-6?
You: [call validate_cuit] → valid
You: [call lookup_cuit_afip] → { available: false, error: "...not configured..." }
You should reply: confirm the CUIT is valid (with persona type from validate_cuit's
                  result), then EXPLAIN HONESTLY that the AFIP lookup isn't configured
                  in this app and surface the setup steps. Offer to validate other
                  CUITs.
```

### Pattern 3: User asks for AFIP info on a known-invalid CUIT

```
User: ¿Quién es el dueño del CUIT 20-12345678-9?
You: [call validate_cuit] → invalid (wrong check digit)
You should reply: explain the CUIT is invalid BEFORE calling lookup_cuit_afip
                  (which would just return "no encontrado" or rate-limit waste).
                  Suggest the corrected CUIT.
```

## Composition with other `@ar-agents/*` packages

| Pair with | Why |
| --- | --- |
| [`@ar-agents/mercadopago`](../mercadopago) | Validate buyer CUITs (or seller CUITs for marketplace flows) before creating a subscription. Saves an MP request when the CUIT is malformed. |
| `@ar-agents/whatsapp` (planned) | Personalize WhatsApp messages with the AFIP-known taxpayer name. |
| `@ar-agents/meta-ads` (planned) | Validate the advertiser's CUIT before launching ads. |

## Performance characteristics

| Operation | Latency | Cost | External I/O |
| --- | --- | --- | --- |
| `validate_cuit` | <1ms | $0 | None |
| `lookup_cuit_afip` (unconfigured) | <1ms | $0 | None: returns instantly |
| `lookup_cuit_afip` (configured) | 200–800ms | $0 | AFIP SOAP |

Implications:
- `validate_cuit` is so cheap you can call it preemptively whenever a user mentions a CUIT, even if you're not sure they want validation. Pattern: "I noticed the CUIT you mentioned ends in 9, but the correct check digit is 5: did you mean 20-12345678-6?"
- `lookup_cuit_afip` is moderately expensive: only call it when the user explicitly asks for taxpayer info. Don't preemptively look up every CUIT mentioned.

## Argentine context (for non-AR agents)

- **CUIT** = Clave Única de Identificación Tributaria. 11-digit AR taxpayer ID.
- **CUIL** = Same format, used in employment context.
- **AFIP** = Federal tax authority (similar role to IRS in US, HMRC in UK).
- **ARCA** = Brand name AFIP introduced in late 2024; same agency.
- **Monotributo** = Simplified tax regime for small taxpayers, with categories A (lowest income) through K (highest). Most freelancers and small-business owners are on monotributo.
- **Responsable Inscripto** = Standard VAT-registered taxpayer.
- The 2-digit prefix encodes person type: `20`/`27` = persona física masculino/femenino; `30`/`33`/`34` = persona jurídica (companies); `23`/`24` = persona física extranjera or special cases.

## What this package will NEVER do

- Issue invoices or interact with AFIP's invoicing webservices (out of scope).
- Mutate taxpayer state on AFIP's side.
- Cache taxpayer data without explicit caller opt-in.
- Make up data when AFIP lookup is unavailable.
