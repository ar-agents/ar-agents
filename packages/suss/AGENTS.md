# `@ar-agents/suss` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **SUSS** (Sistema Único de la Seguridad Social) — the AR payroll math agents need to compute employer-side contributions every month and assemble the monthly SICOSS DDJJ.

This is the **only AR-payroll-aware agent library** as of v0.1. There is no `pyafipws`-style equivalent for SICOSS.

## When to use which tool

| Goal                                              | Tool                              | Notes                                          |
| ------------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| Compute what an employee + employer owe this month | `suss_calculate_employee_month`   | Pure math. Returns the structured breakdown.   |
| Roll up the month into the SICOSS DDJJ            | `suss_build_ddjj`                 | Per-vector + per-employee totals.              |
| File the SICOSS DDJJ                              | `suss_submit_ddjj`                | v0.1 throws — submission adapter pending.      |

## Constraints

- **All amounts in ARS centavos** (integers). `100_000_000` = ARS 1.000.000.
- **Rates are fractions** (0.1017 = 10.17%).
- **CUIL is 11 digits** (with or without hyphens).
- **`period` is YYYY-MM**.
- **ART rate is configurable**, not baked. Pass `artRate` (or `defaultArtRate` on the DDJJ) from the employer's ART contract.

## Default rate matrix (Decreto 814/01, snapshot 2024-Q4)

| Vector | Régimen general | Grandes empleadores |
|---|---:|---:|
| Jubilación SIPA | 10.17% | 12.71% |
| INSSJP | 1.50% | 1.62% |
| Asignaciones Familiares | 4.70% | 5.40% |
| Fondo Nacional Empleo | 0.94% | 1.07% |
| Obra social empleador | 6.00% | 6.00% |
| **ART (configurable)** | 5.00% | 5.00% |

Employee aportes are constant across regimes: **11% jubilación + 3% INSSJP + 3% obra social = 17%**.

## Decision tree on régimen

- Most PyMEs / servicios → `general` (Decreto 814/01).
- Empleadores grandes (industria + comercio mayorista del Decreto 1009/01) → `grandes_empleadores`.
- Empleadores con beneficio Ley 27.430 → use `general` and apply the external bonificación post-hoc (the v0.1 surface doesn't model the reduction matrix).

## Confirmation gates (HITL)

- `suss_submit_ddjj` — **always confirm.** Files a tax return. v0.1 throws by default so the gate is implicit.

Math tools (`suss_calculate_employee_month`, `suss_build_ddjj`) don't need a gate.

## Vector totals (what AFIP expects)

SICOSS distinguishes three contribution vectors that the employer reports separately:

- **Vector A — Seguridad Social** = jubilación + INSSJP + asignaciones familiares + FNE
- **Vector B — Obra Social**
- **Vector C — ART**

The `EmployeeMonthResult` exposes them via `contribucionesSeguridadSocialCentavos`, `contribucionesObraSocialCentavos`, `contribucionesArtCentavos`. `buildSicossDdjj` sums them across employees into the same shape.

## Error model

- `SussValidationError` — bad input. Do NOT retry.
- `SussUnconfiguredError` — submission adapter not wired. Surface to operator.

## AR context (for non-AR agents)

- **Aportes ≠ Contribuciones.** Aportes = employee-side (descontados del sueldo). Contribuciones = employer-side (encima del sueldo). The employer remits BOTH to AFIP but only the contribuciones come "out of pocket" — aportes are passed through.
- **SIPA** = Sistema Integrado Previsional Argentino (jubilación). Replaced AFJP in 2008.
- **INSSJP / PAMI** = health for retirees.
- **AAFF** = Asignaciones Familiares (per-child, etc.). Employer pays into FUSA; ANSES pays the employee.
- **FNE** = Fondo Nacional de Empleo (severance fund).
- **ART** = Aseguradora de Riesgos del Trabajo (workplace insurance).
- **F.931 / SICOSS** is the monthly form. Due day ~15 of the following month.
- **AFIP rebranded to ARCA in 2025.** "SICOSS" name didn't change.

## What this package does NOT cover (v0.1)

- Asignaciones Familiares per-employee calc (delegated to ANSES; employer just contributes to the FUSA).
- Promoción de empleo reductions (Ley 27.430+).
- Régimen de Casas Particulares (Ley 26.844) and rural.
- Real SICOSS XML/txt submission — adapter contract only.
- Bonus / SAC / vacaciones particularidades (compute the brute separately and feed it as `remuneracionBrutaCentavos`).
