# Integration tests vs MP sandbox

These tests hit the **real MP sandbox** (`api.mercadopago.com` with a TEST-
prefixed access token). They verify behaviors that MSW mocks can't catch:

- MP's actual response shapes (forward-compat: catches when MP adds fields)
- Real rate-limit headers + Retry-After behavior
- HMAC signature flow against MP's actual signing
- Timing of webhook delivery
- Idempotency-key dedup on MP's side
- Real status_detail values (catches when MP adds new ones)

## Running

These tests are **gated by an env var** so they don't run by default in CI:

```bash
# Get a TEST access token from https://www.mercadopago.com.ar/developers/panel/credentials
export MP_INTEGRATION_TOKEN="TEST-1234567890-abcdef-..."

# Run integration suite
MP_INTEGRATION_TESTS=1 pnpm --filter @ar-agents/mercadopago test:integration
```

Without `MP_INTEGRATION_TESTS=1`, the entire suite is skipped via `it.skipIf`.

## Why not run in CI by default?

1. They need real MP credentials (security: don't commit secrets to public CI)
2. They make real network calls (cost: slower, can hit rate limits)
3. They depend on MP's sandbox availability (flaky if MP has an incident)

The intended workflow:
- **Local dev**: run on-demand before publishing a release
- **GitHub Actions**: run weekly via `schedule` workflow with `MP_INTEGRATION_TOKEN` from secrets
- **Pre-release**: run once before each `npm publish`

## What's covered

| File | Scenarios |
|------|-----------|
| `payment-flow.test.ts` | create_payment with test cards (APRO/OTHE/CONT/FUND), refund partial + full, search by external_reference |
| `subscription-flow.test.ts` | create_plan, subscribe, get_status, cancel — full lifecycle |
| `preference-flow.test.ts` | create + retrieve + update + verify init_point format |
| `customer-flow.test.ts` | create, find_by_email idempotency, update, list cards |
| `health-check.test.ts` | mp_health_check returns ok=true; latency < 5s |

All tests are **idempotent and side-effect-safe** for sandbox: external_references are timestamped + uuid'd to avoid collisions across runs.
