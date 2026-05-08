---
"@ar-agents/identity": minor
---

Add `identity doctor` CLI for environment diagnosis.

```bash
npx @ar-agents/identity doctor
```

Validates `AFIP_CUIT` (algorithm-only), checks `AFIP_CERT_PEM` and `AFIP_KEY_PEM` are PEM-shaped, and confirms `AFIP_ENV` is `prod` or `homo`. Lists the 2 tools (`validate_cuit` always-on, `lookup_cuit_afip` adapter-required). Exit codes 0/1 for CI.

Helps users distinguish "env vars missing" from "cert wrong-CA" from "wrong service alias" before hitting the WSAA round-trip.
