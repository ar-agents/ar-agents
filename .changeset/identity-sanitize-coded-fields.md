---
"@ar-agents/identity": patch
---

Sanitize `monotributoCategoria` and `fechaInscripcion` in AFIP padron data (DeepSec MEDIUM follow-up).

The prompt-injection sanitizer covered `nombre`/`domicilioFiscal`/`actividades` but skipped `monotributoCategoria` and `fechaInscripcion` as "coded fields". The WSCDC parser actually fills both from raw AFIP response text (`<descripcionCategoria>`, contract/categorization dates), so a hostile taxpayer record could smuggle control/zero-width/bidi characters and instruction-like text through them into the agent loop. `sanitizeAfipData` now cleans both fields, and the `_provenance` note lists them as untrusted. `condicion` (a derived enum, never raw text) is the only field passed through.
