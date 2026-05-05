---
"@ar-agents/identity": minor
---

First end-to-end functional release of the WSAA + WSCDC adapter.

**Bug fixes (the previous v0.2.0 didn't work end-to-end against AFIP)**

- WSCDC migrated from deprecated `ws_sr_padron_a5` to `ws_sr_padron_a13`. AFIP retired A5; only A4 and A13 remain in the service catalog.
- WSAA: switched signing from detached PKCS#7 CMS to attached. AFIP needs eContent embedded to verify; detached signing returned `cms.sign.invalid`.
- WSCDC envelope: targetNamespace `http://a13.soap.ws.server.puc.sr/`, operation renamed from `getPersona_v2` to `getPersona`, child elements (token, sign, cuitRepresentada, idPersona) are NOT namespace-prefixed (A13 WSDL uses `elementFormDefault="unqualified"`).
- WSCDC parser updated for A13 response shape: `<personaReturn>` wrapper, multiple `<domicilio>` blocks distinguished by `<tipoDomicilio>` (FISCAL vs LEGAL/REAL), `codigoPostal` (not `codPostal`), `descripcionActividadPrincipal` at persona level.
- SOAP fault handling: HTTP 500 with structured Fault now passes through to the parser, which converts `inexistente` faults into `available: false` results instead of throwing.

**New: PEM-string adapter mode for serverless**

Added `certPem` / `keyPem` options alongside `certPath` / `keyPath` so the lib works in filesystem-less runtimes (Vercel, Lambda, Cloudflare Workers). Paste PEM contents into env vars. PEM strings are robust-normalized to handle escaped `\n` survival from dashboard env-var paste and single-line copy-paste accidents.

**Known limitation**

A13 is "datos generales" — it does NOT include monotributo category or fechaInscripcion. The lib reports `condicion: "DESCONOCIDA"` and null for those fields. Full constancia (monotributo + IVA condition + impuestos asociados) requires `ws_sr_constancia_inscripcion`, planned for v0.4.

Verified end-to-end against AFIP prod via the `cuit-hello` reference app deployed to Vercel.
