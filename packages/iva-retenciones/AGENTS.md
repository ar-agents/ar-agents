# `@ar-agents/iva-retenciones` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **IVA retentions** — RG 2854/10 mirror of `iva-percepciones`. Where percepción adds a charge to a sale (buyer pays more), retención withholds part of the IVA component on a payment to a supplier (supplier takes home less).

## When to use which tool

| Goal                                       | Tool                              | Notes                                           |
| ------------------------------------------ | --------------------------------- | ----------------------------------------------- |
| Retain on a supplier payment               | `iva_retention_calculate`         | Pure math. Returns 0 with waiverReason if waived.|
| Assemble monthly DDJJ                      | `iva_retention_build_ddjj`        | Per-regime + per-supplier breakdown.            |
| File the monthly SIRE DDJJ                 | `iva_retention_submit_ddjj`       | Requires custom adapter. Confirmation gate.     |

## Constraints

- **`ivaCentavos`** is the IVA component of the comprobante, NOT the net or total. Easy to confuse — RG 2854 retains a percentage OF THE IVA, not of the invoice total.
- **Rates are fractions** (0.5 = 50%, 0.8 = 80%).
- **CUIT is 11 digits**.
- **`paymentDate` is YYYY-MM-DD**, `period` is YYYY-MM.

## Default rates (RG 2854/10 snapshot 2024-Q4)

| Operation type             | Responsable inscripto | No categorizado | Monotributista / exento |
|----------------------------|----------------------:|----------------:|------------------------:|
| Cosas muebles              | 80%                   | 100%            | 0%                      |
| Servicios                  | 50%                   | 100%            | 0%                      |
| Locaciones de inmuebles    | 50%                   | 100%            | 0%                      |

Minimum IVA per comprobante for RI: $5.000 (500_000 centavos). Below the mínimo, retention = 0 with `waiverReason: "below_minimum"`. No-categorizado has no mínimo.

## Decision tree

- Supplier paid has **non-retention certificate**? → 0; surface the cert requirement.
- Supplier is **exento**? → 0 with `waiverReason: "exempt_supplier"`.
- Supplier is **monotributista**? → 0 with `waiverReason: "monotributista"`.
- Supplier is **no_categorizado**? → 100% of IVA, no mínimo.
- Supplier is **responsable_inscripto**? → check IVA vs mínimo; retain percentage per operation type.

## Confirmation gates (HITL)

- `iva_retention_submit_ddjj` — **always confirm.** Files a SIRE DDJJ.

## Error model

- `IvaRetentionValidationError` — bad input.
- `IvaRetentionRateNotFoundError` — table missing the (regime, operationType, supplierStatus) tuple.
- `IvaRetentionUnconfiguredError` — submission adapter not wired.

## AR context (for non-AR agents)

- **Retención de IVA ≠ percepción de IVA.** Retention reduces what the seller takes home; perception increases what the buyer pays. Same tax, opposite direction.
- **Retención de IVA ≠ retención de Ganancias.** Different tax (IVA = federal value-added; Ganancias = federal income), different RG (2854 vs 830), different SIRE form. Use `@ar-agents/sicore` for Ganancias retentions.
- **AFIP rebranded to ARCA** in 2025. Service names didn't change.

## What this package does NOT cover (v0.1)

- RG 5057 servicios digitales — code reserved, no default rates. Pass `rateTable`.
- RG 2616 granos / RG 3411 honorarios — out of scope.
- Real SIRE submission — adapter contract only.
