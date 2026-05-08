---
"@ar-agents/facturacion": minor
---

Add `@ar-agents/facturacion/testing` subpath with `MockWsfeClient` (public-method-compatible stand-in for `WsfeClient`) and result factories (`mockSolicitarCaeApproved`, `mockSolicitarCaeRejected`, `mockUltimoComprobante`, `mockConsultarComprobante`, `mockDummyOk`, `mockDummyDown`). Lets agent loops and recipes test factura-emission flows without a live AFIP/ARCA WSAA + WSFE round-trip.
