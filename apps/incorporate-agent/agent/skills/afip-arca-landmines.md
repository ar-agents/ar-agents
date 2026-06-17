---
description: Argentine tax-identity and AFIP/ARCA gotchas. Load before validating a CUIT or reasoning about monotributo, IVA, or electronic invoicing.
---

# AFIP/ARCA landmines (Argentine tax identity)

Use the ar-agents MCP connection for these rather than reasoning about them yourself.

- **CUIT/CUIL validation is pure algorithm (modulo-11).** `validate_cuit` works offline, no credentials. Always validate the administrator's and the company's CUIT before incorporating. Prefix maps to person type: 20/23/24/27 persona humana, 30/33/34 persona jurídica.
- **Padron lookups need a cert.** Name, monotributo category and IVA condition come from `ws_sr_constancia_inscripcion`, which needs an AFIP/ARCA X.509 cert. The MCP connection only exposes the no-credential subset; do not promise a live padron lookup unless a cert is wired.
- **AFIP was rebranded ARCA (Agencia de Recaudación y Control Aduanero).** Some panels say AFIP, others ARCA; the WSAA service names did not change.
- **Do not hand-roll WSAA.** Signatures must be ATTACHED PKCS#7 (detached returns cms.sign.invalid), prod certs do not work against the homologation endpoint, and `ws_sr_padron_a5` is deprecated (use A13 or ws_sr_constancia_inscripcion). The ar-agents packages handle this.
- **Tax fit.** A Sociedad Automatizada pays tax like any company (IVA, IIBB, Ganancias, or monotributo by category). Use the MCP IVA/SICORE/SUSS calculators for withholdings; do not invent rates.
