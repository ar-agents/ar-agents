# cuit-hello

**Fase 3** del [AR Agents stack](../../README.md). Demo of CUIT/CUIL validation
exposed as Vercel AI SDK 6 agent tools.

## Status

- ✅ **v0.1 (this build):** algorithmic validation only (format + prefix +
  modulo-11 check digit). 100% offline, zero external API calls.
- ⏳ **v0.2 (planned):** AFIP padron lookup (taxpayer name, tax condition,
  monotributo category). Requires X.509 cert setup — see
  [`src/lib/afip-stub.ts`](./src/lib/afip-stub.ts) for the full walkthrough.

## What it ships

Two API surfaces:

### 1. Agent endpoint (`POST /api/agent`)

Conversational interface. The agent has two tools:

| Tool                | What it does                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| `validate_cuit`     | Pure-algorithm validation. Returns format + check-digit + person type.    |
| `lookup_cuit_afip`  | AFIP padron lookup. v0.1: returns "not configured" until cert is wired.   |

```bash
curl -X POST http://localhost:3014/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Validá el CUIT 20-12345678-6 y decime qué sabés de él."}'
```

### 2. Direct REST endpoint (`/api/cuit`)

Pure-algorithm validation without LLM in the loop. Cheap, fast, deterministic
— ideal for form validation in high-volume use cases.

```bash
# Single validation
curl 'http://localhost:3014/api/cuit?value=20-12345678-6'

# Batch validation
curl -X POST http://localhost:3014/api/cuit \
  -H "Content-Type: application/json" \
  -d '{"values":["20-12345678-6","30707500126","27ABCD"]}'
```

Returns:

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

## CUIT algorithm summary

The algorithm is documented in [`src/lib/cuit.ts`](./src/lib/cuit.ts) and
implements the AFIP modulo-11 check:

1. Strip non-digit characters from input.
2. Verify the result is exactly 11 digits.
3. Verify the 2-digit prefix maps to a known person type:
   - `20`, `27` → persona física (masculino, femenino)
   - `23`, `24` → persona física extranjera / casos especiales
   - `30`, `33`, `34` → persona jurídica
4. Compute `Σ(weight[i] × digit[i])` for the first 10 digits using weights
   `[5, 4, 3, 2, 7, 6, 5, 4, 3, 2]`.
5. Take `sum mod 11`. The check digit is `0` if remainder is 0, `9` if
   remainder is 1, otherwise `11 - remainder`.

## Setup

### 1. Install (from monorepo root)

```bash
cd /path/to/ar-agents
pnpm install
```

### 2. Credentials

Copy `.env.local.example` → `.env.local` and fill in the AI Gateway key:

```bash
cp .env.local.example .env.local
```

You need:

| Var                   | Where to get it                                                                 |
| --------------------- | ------------------------------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`  | [vercel.com/dashboard → AI Gateway → API Keys](https://vercel.com/dashboard)   |

The AFIP-related env vars are optional for v0.1 (the agent reports them as
unconfigured). They'll be required for v0.2 padron lookup.

### 3. Run

```bash
pnpm dev   # localhost:3014
```

## Test cases

Some real and synthetic CUITs to test against:

| CUIT                | Expected                  | Notes                                         |
| ------------------- | ------------------------- | --------------------------------------------- |
| `20-12345678-6`     | valid, fisica_masculina   | Naza's CUIT (Monotributo Cat A)               |
| `30-70750012-9`     | valid, juridica           | Synthetic juridical CUIT (correct check)      |
| `00-12345678-9`     | invalid, prefix unknown   | Prefix 00 not in PREFIX_TO_TYPE               |
| `20-12345678-9`     | invalid, check digit      | Wrong check digit (should be 5)               |
| `20417581`          | invalid, length           | Too short                                     |
| `20.12345678.6`     | valid                     | Dots accepted; normalization strips them      |
| `20 12345678 6`     | valid                     | Spaces accepted                               |

## Acceptance criteria for Fase 3

- [x] Agent receives a CUIT, returns valid/invalid + person type in <5s
- [x] Direct `/api/cuit` endpoint for high-volume non-LLM validation
- [x] AFIP padron lookup interface stubbed with clear setup docs
- [ ] AFIP padron real implementation (Fase 3b — requires user-provided cert)

## Roadmap

- **Fase 3b**: replace `src/lib/afip-stub.ts` with real WSAA + WSCDC SOAP
  integration once an AFIP cert is registered.
- **Fase 4**: extract validation algorithm + AFIP integration into
  `@ar-agents/identity` npm package.
