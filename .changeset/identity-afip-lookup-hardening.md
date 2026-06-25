---
"@ar-agents/identity": minor
---

Harden the agent-callable AFIP padron lookup against abuse and prompt injection (DeepSec MEDIUM).

- `lookup_cuit_afip` now enforces the CUIT checksum (`parseCuit().valid`) in code before querying AFIP, instead of relying on the tool description to tell the model to call `validate_cuit` first. Malformed CUITs short-circuit with a clear error and never reach the adapter.
- New `IdentityToolsOptions.authorizeLookup` hook (`IdentityLookupContext` → `IdentityLookupDecision`) lets hosts add authorization, per-tenant allowlisting, or rate limiting. It runs after validation and before the adapter, and fails closed: returning `false` / `{ allowed: false, reason }` denies the lookup without hitting AFIP.
- AFIP free-text (`nombre`, `domicilioFiscal`, `actividades`) is now sanitized — control codes, zero-width characters, and bidi overrides stripped — both at the WSCDC parser and at the tool boundary, and tool output carries a `_provenance` marker tagging it as untrusted external data so an agent treats embedded text as data, never instructions.

New exports: `sanitizeRegistryText`, `sanitizeAfipData`, `withRegistryProvenance`, `REGISTRY_PROVENANCE`, `IdentityLookupContext`, `IdentityLookupDecision`.
