# @ar-agents/iibb

## 0.1.0

### Minor Changes

- [`c5f33f5`](https://github.com/ar-agents/ar-agents/commit/c5f33f56d10e15ace1f3d219604bae97cd85d658) - Two new packages in the ar-agents toolkit:

  - `@ar-agents/uala` v0.1.0 — Ualá Bis agent toolkit. 8 typed tools for payment links, QR cobros, transaction history, payouts, balance, and marketplace OAuth. Adapter pattern (UnconfiguredUalaAdapter + UalaApiAdapter), full error model, 12 unit tests.
  - `@ar-agents/iibb` v0.1.0 — Ingresos Brutos agent toolkit. Pure-math primitives (RateBook, computeDdjj, calculateRetention, calculatePerception) covering LOCAL + Convenio Multilateral Article 2 (general regime) across CABA + 23 provinces + CM umbrella. 4 typed tools, adapter contract with stub adapters for AGIP / ARBA / Comisión Arbitral, 16 unit tests.

  Both packages follow the agents.md convention (AGENTS.md per package, tools.manifest.json) and use the same shape as the established `@ar-agents/banking` and `@ar-agents/mercadopago` packages: Vercel AI SDK 6+ tool collections, adapter pattern with throwing default for safe unit-testing, MIT licensed, SLSA provenance via the existing release workflow.
