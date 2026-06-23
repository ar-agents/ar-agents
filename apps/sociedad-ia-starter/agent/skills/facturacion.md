## facturacion · AFIP WSFE

Emití facturas electrónicas vía WSFE. Siempre corré `validate_solicitar_cae`
(pre-flight) antes de `solicitar_cae`: evita el ~30% de rechazos mecánicos de AFIP
por punto de venta, tipo de comprobante o importes mal armados.
