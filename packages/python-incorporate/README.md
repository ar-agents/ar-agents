# ar-agents-incorporate (Python)

> Zero-dependency-runtime Python client for [`/api/auto-incorporate`](https://ar-agents.ar/api/auto-incorporate). One sync or async call → an Argentine sociedad-IA's full incorporation kit (generated source files, Vercel deploy URL, env-var manifest, legal checklist, signed audit-log reference). Mirror of [`@ar-agents/incorporate`](https://www.npmjs.com/package/@ar-agents/incorporate) on npm.

[![PyPI](https://img.shields.io/pypi/v/ar-agents-incorporate.svg)](https://pypi.org/project/ar-agents-incorporate/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/downloads/)

## Why

The npm `@ar-agents/incorporate` is the canonical surface for TypeScript orchestrators. This package is the same surface, in idiomatic Python, for the very-large slice of agent infrastructure that runs on Python (Anthropic SDK, OpenAI SDK, LangChain, LangGraph, llama-index, custom orchestration scripts, Jupyter notebooks).

Both packages hit the same endpoint, return the same shape, support the same audit-log session-chaining. Pick whichever your stack prefers.

## Install

```bash
pip install ar-agents-incorporate
# or
poetry add ar-agents-incorporate
# or
uv add ar-agents-incorporate
```

Requires Python 3.10+. Single runtime dep: `httpx>=0.27`.

## Quickstart (sync)

```python
from ar_agents_incorporate import incorporate

result = incorporate(
    denominacion="ACME-AI SAS",
    tipo="SOCIEDAD-IA",
    capital_social=1,
    objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
)

if not result.ok:
    for f in result.validation.findings:
        print(f"[{f.severity}] {f.field}: {f.message}")
    raise SystemExit(1)

print("Slug:        ", result.sociedad.slug)
print("Deploy URL:  ", result.deploy.one_click_url)
print("Audit log:   ", result.audit.dashboard_url)
print("HMAC:        ", result.audit.entry.hmac)

# Persist the four generated files
import pathlib
out = pathlib.Path("./out")
(out / "lib").mkdir(parents=True, exist_ok=True)
for path, contents in result.config.items():
    (out / path).write_text(contents)
```

## Quickstart (async)

```python
import asyncio
from ar_agents_incorporate import aincorporate

async def main():
    result = await aincorporate(
        denominacion="ACME-AI SAS",
        tipo="SOCIEDAD-IA",
        capital_social=1,
        objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
    )
    print(result.deploy.one_click_url)

asyncio.run(main())
```

## API

### `incorporate(input=None, **kwargs) -> IncorporateResult`

Pass either an `IncorporateInput` dataclass or keyword args directly. Returns one of:
- `IncorporateSuccess` (HTTP 200) — full incorporation kit
- `IncorporateValidationFailure` (HTTP 422) — `result.ok` is `False`, `result.validation.findings` is the list

Raises `IncorporateError` on network issues or unexpected HTTP statuses (5xx, 429, etc.). Validation failures are *results*, not exceptions.

```python
from ar_agents_incorporate import IncorporateInput, Representante, incorporate

result = incorporate(
    IncorporateInput(
        denominacion="ACME-AI SAS",
        tipo="SAS",
        capital_social=200_000,
        objeto="...",
        representante=Representante(nombre="Pérez, Juan", cuit="20-12345678-9"),
        email_contacto="ops@acme.example",
        piezas=["identity", "gde-tad", "mercadopago", "banking", "facturacion"],
        session_id="my-tenant-id-123",
    )
)
```

### `incorporate_or_throw(input=None, **kwargs) -> IncorporateSuccess`

Same as `incorporate()` but raises `IncorporateValidationError` (with `.findings`) instead of returning a failure envelope.

### `describe(**kwargs) -> dict`

`GET /api/auto-incorporate` — endpoint self-description. Useful for capability discovery.

### `fetch_audit(session_id, *, verify=False, **kwargs) -> dict`

Read the audit log for a session. Pass `verify=True` to ask the server to recompute every HMAC and report tampering.

### Async equivalents

Every sync function has an async sibling: `aincorporate`, `aincorporate_or_throw`, `adescribe`, `afetch_audit`.

## Multi-step orchestration

Pass the same `session_id` across multiple incorporations and `/api/play` tool calls to chain them under a single forensic timeline:

```python
import uuid
session_id = str(uuid.uuid4())

result1 = incorporate(..., session_id=session_id)
# later...
result2 = incorporate(..., session_id=session_id)

audit = fetch_audit(session_id, verify=True)
print(audit["verification"])  # {"verified": 2, "tampered": 0, "hmacWired": True, ...}
```

## With your existing httpx client

If your app uses a shared `httpx.Client` for connection pooling / instrumentation, pass it in:

```python
import httpx
from ar_agents_incorporate import incorporate

with httpx.Client(timeout=10.0, headers={"x-trace-id": "..."}) as client:
    result = incorporate(
        denominacion="ACME-AI SAS",
        tipo="SAS",
        capital_social=200_000,
        objeto="...",
        client=client,
    )
```

## Verification badge for embeds

Every successful `incorporate()` call writes a HMAC-signed audit entry. Embed the verification badge in your dashboard / README to show the forensic-clean status:

```markdown
![ar-agents audit](https://ar-agents.ar/api/badge/{session_id})
```

The badge color updates live: blue = verified · N/M, red = tampered · N, gray = no-hmac / no entries.

## Errors

```python
from ar_agents_incorporate import (
    IncorporateError,
    IncorporateValidationError,
    incorporate_or_throw,
)

try:
    result = incorporate_or_throw(...)
except IncorporateValidationError as e:
    for f in e.findings:
        print(f.code, f.field, f.message)
except IncorporateError as e:
    print(f"HTTP {e.status}: {e.response}")
```

## Testing

```bash
pip install -e ".[test]"
pytest
```

Tests use `respx` to mock httpx requests at the wire level — no network in CI.

## License

MIT © Nazareno Clemente. The endpoint this client wraps ships HMAC-SHA256-signed audit log entries; verify them at any time at <https://ar-agents.ar/verify>.
