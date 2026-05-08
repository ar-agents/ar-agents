# @ar-agents/gde-tad — AGENTS.md

## When to call which tool

- **`validate_igj_inscription`** — BEFORE submitting any IGJ inscription via TAD. Pure algorithm, no auth, no network. Free.
- **`list_domicilio_inbox`** — every morning loop, OR before any major decision. Tells you if there's a binding deadline pending. Read-only.
- **`get_critical_notifications`** — same as `list_domicilio_inbox` but pre-filtered to severity=critical and sorted by deadline. Cheaper to reason over.
- **`list_mis_tramites`** — for reporting and due diligence. Slow path; not for hot loops.

## Severity heuristic

| Severity | Meaning | Examples |
| --- | --- | --- |
| `critical` | Binding deadline; missing it has legal consequences. | Intimación ARCA, baja IGJ, clausura, multa, sumario. |
| `important` | Likely binding but not always; agent should triage. | Resolución, providencia, vencimiento próximo. |
| `info` | Courtesy notice; no action needed. | Acuse de recibo, circular informativa, notificación de cortesía. |

## Failure modes

- `available: false` — the adapter isn't wired (read the `error` for the setup hint), OR auth failed against TAD.
- `findings: [{ severity: "error" }]` from `validate_igj_inscription` — pre-flight rejection. Surface verbatim to the user; the messages are actionable.

## What this package does NOT do

- File trámites programmatically. Write-side requires per-organism integration that's still rolling out (RFC-001 § 3.4).
- Generate the actual PDFs that TAD requires. Use `@ar-agents/firma-digital` to sign them.
- Authenticate users. Use `@ar-agents/mi-argentina` for OIDC.

## Composition

```
@ar-agents/mi-argentina  →  authenticate the human owner
@ar-agents/gde-tad       →  read DEC inbox + Mis Trámites + pre-flight IGJ
@ar-agents/firma-digital →  sign PDFs locally before TAD submit
@ar-agents/igj           →  cross-check public registry data
```

The four together cover the gov-side legal-existence surface for a sociedad-IA.
