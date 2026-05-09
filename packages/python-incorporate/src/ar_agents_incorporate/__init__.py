"""
ar-agents-incorporate — Python client for the ar-agents.vercel.app
/api/auto-incorporate endpoint.

Lets an external agent (USA-LLC, Claude, GPT, custom orchestrator)
self-incorporate an Argentine sociedad-IA programmatically. Mirrors the
@ar-agents/incorporate npm package's surface in idiomatic Python.

Quickstart:

    from ar_agents_incorporate import incorporate

    result = incorporate(
        denominacion="ACME-AI SAS",
        tipo="SOCIEDAD-IA",
        capital_social=1,
        objeto="Operación de servicios digitales y desarrollo de software propio.",
    )

    if not result.ok:
        for f in result.validation.findings:
            print(f"[{f.severity}] {f.field}: {f.message}")
        raise SystemExit(1)

    print("Slug:        ", result.sociedad.slug)
    print("Deploy:      ", result.deploy.one_click_url)
    print("Audit log:   ", result.audit.dashboard_url)
    print("HMAC:        ", result.audit.entry.hmac)
"""

from ar_agents_incorporate.client import (
    PIEZA_IDS,
    REQUIRED_PIEZAS,
    AuditEntry,
    AuditReference,
    DEFAULT_BASE_URL,
    Deploy,
    EnvVar,
    IncorporateError,
    IncorporateInput,
    IncorporateValidationError,
    Representante,
    Rfc001,
    Sociedad,
    ValidationFinding,
    ValidationResult,
    aincorporate,
    aincorporate_or_throw,
    afetch_audit,
    adescribe,
    fetch_audit,
    describe,
    incorporate,
    incorporate_or_throw,
)

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "PIEZA_IDS",
    "REQUIRED_PIEZAS",
    "DEFAULT_BASE_URL",
    "AuditEntry",
    "AuditReference",
    "Deploy",
    "EnvVar",
    "IncorporateError",
    "IncorporateInput",
    "IncorporateValidationError",
    "Representante",
    "Rfc001",
    "Sociedad",
    "ValidationFinding",
    "ValidationResult",
    # sync
    "incorporate",
    "incorporate_or_throw",
    "describe",
    "fetch_audit",
    # async
    "aincorporate",
    "aincorporate_or_throw",
    "adescribe",
    "afetch_audit",
]
