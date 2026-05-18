---
"@ar-agents/facturacion": patch
---

Add AFIP RG 5616 `CondicionIVAReceptorId` support to `solicitarCAE`.

AFIP Resolución General 5616 made `CondicionIVAReceptorId` mandatory in
`FECAESolicitar`; requests omitting it are rejected with observación 10246.
This release adds:

- A new `CondicionIvaReceptor` catalog (and `CondicionIvaReceptorCode` type)
  covering the `FEParamGetCondicionIvaReceptor` codes.
- An optional `condicionIvaReceptorId` field on `SolicitarCaeInput`.
- A safe default in the request builder when omitted (DocTipo
  `CONSUMIDOR_FINAL` → 5; otherwise Responsable Inscripto → 1) so existing
  callers keep working without code changes while becoming RG 5616
  compliant.
