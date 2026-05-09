"""
Unit tests for the sync surface. The async surface mirrors the same logic
and is exercised in test_client_async.py.

Uses respx to mock httpx requests at the wire level — no network in CI.
"""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from ar_agents_incorporate import (
    DEFAULT_BASE_URL,
    PIEZA_IDS,
    REQUIRED_PIEZAS,
    IncorporateError,
    IncorporateInput,
    IncorporateValidationError,
    Representante,
    Sociedad,
    describe,
    fetch_audit,
    incorporate,
    incorporate_or_throw,
)


_SUCCESS_BODY = {
    "ok": True,
    "sociedad": {
        "denominacion": "ACME-AI SAS",
        "tipo": "SAS",
        "capitalSocial": 200000,
        "slug": "acme-ai-sas",
    },
    "validation": {"valid": True, "findings": []},
    "config": {
        "package.json": "{}",
        "lib/agent.ts": "// generated",
        ".env.example": "",
        "README.md": "# x",
    },
    "envVars": [{"name": "AFIP_CERT_PEM", "description": "X.509 cert"}],
    "checklist": ["step 1"],
    "deploy": {
        "target": "vercel",
        "oneClickUrl": "https://vercel.com/new/clone?...",
        "sourceUrl": "https://github.com/ar-agents/ar-agents",
        "manualSteps": ["step 1"],
    },
    "audit": {
        "sessionId": "test-session-aaaa",
        "backend": "vercel-kv",
        "entry": {
            "id": "id-1",
            "sessionId": "test-session-aaaa",
            "ts": "2026-05-09T12:00:00Z",
            "tool": "auto_incorporate",
            "governance": "audit-logged",
            "input": {"denominacion": "ACME-AI SAS"},
            "output": {"slug": "acme-ai-sas"},
            "hmac": "sha256:abc123",
            "durationMs": 12,
        },
        "url": "https://ar-agents.vercel.app/api/play/audit/test-session-aaaa",
        "verifyUrl": "https://ar-agents.vercel.app/api/play/audit/test-session-aaaa?verify=1",
        "dashboardUrl": "https://ar-agents.vercel.app/dashboard/test-session-aaaa",
    },
    "rfc001": {"version": "1.0", "url": "https://ar-agents.vercel.app/rfcs/001"},
    "generatedAt": "2026-05-09T12:00:00.000Z",
}


_VALIDATION_FAILURE_BODY = {
    "ok": False,
    "validation": {
        "valid": False,
        "findings": [
            {
                "code": "denominacion_reserved_word",
                "severity": "error",
                "field": "denominacion",
                "message": "ACME Nacional SAS contains reserved word",
            }
        ],
    },
    "rfc001": {"version": "1.0", "url": "https://ar-agents.vercel.app/rfcs/001"},
}


# ─── Constants ──────────────────────────────────────────────────────────────


def test_pieza_ids_complete():
    assert "identity" in PIEZA_IDS
    assert "mercadolibre" in PIEZA_IDS
    assert len(PIEZA_IDS) == 16


def test_required_piezas_subset():
    for r in REQUIRED_PIEZAS:
        assert r in PIEZA_IDS


# ─── incorporate() ──────────────────────────────────────────────────────────


@respx.mock
def test_incorporate_success_with_dataclass():
    route = respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(200, json=_SUCCESS_BODY)
    )

    result = incorporate(
        IncorporateInput(
            denominacion="ACME-AI SAS",
            tipo="SAS",
            capital_social=200_000,
            objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
        )
    )

    assert route.called
    assert result.ok is True
    assert isinstance(result.sociedad, Sociedad)
    assert result.sociedad.slug == "acme-ai-sas"
    assert result.audit.entry.hmac == "sha256:abc123"


@respx.mock
def test_incorporate_success_with_kwargs():
    route = respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(200, json=_SUCCESS_BODY)
    )

    result = incorporate(
        denominacion="ACME-AI SAS",
        tipo="SOCIEDAD-IA",
        capital_social=1,
        objeto="Operación de servicios digitales para clientes argentinos.",
    )

    assert route.called
    payload = json.loads(route.calls[0].request.content)
    assert payload["capitalSocial"] == 1  # snake_case → camelCase
    assert payload["tipo"] == "SOCIEDAD-IA"
    assert result.ok is True


@respx.mock
def test_incorporate_translates_representante_object():
    route = respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(200, json=_SUCCESS_BODY)
    )

    incorporate(
        denominacion="ACME-AI SAS",
        tipo="SAS",
        capital_social=200_000,
        objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
        representante=Representante(nombre="Pérez, Juan", cuit="20-12345678-9"),
    )

    payload = json.loads(route.calls[0].request.content)
    assert payload["representante"]["nombre"] == "Pérez, Juan"


@respx.mock
def test_incorporate_validation_failure_returns_envelope():
    respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(422, json=_VALIDATION_FAILURE_BODY)
    )

    result = incorporate(
        denominacion="ACME Nacional SAS",
        tipo="SAS",
        capital_social=200_000,
        objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
    )
    assert result.ok is False
    assert result.validation.valid is False
    assert result.validation.findings[0].code == "denominacion_reserved_word"


@respx.mock
def test_incorporate_500_raises_incorporate_error():
    respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(500, json={"error": "boom"})
    )

    with pytest.raises(IncorporateError) as exc:
        incorporate(
            denominacion="ACME-AI SAS",
            tipo="SAS",
            capital_social=200_000,
            objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
        )
    assert exc.value.status == 500


@respx.mock
def test_incorporate_429_raises_with_status_attached():
    respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(429, text="too many")
    )

    with pytest.raises(IncorporateError) as exc:
        incorporate(
            denominacion="ACME-AI SAS",
            tipo="SAS",
            capital_social=200_000,
            objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
        )
    assert exc.value.status == 429


@respx.mock
def test_incorporate_respects_custom_base_url():
    custom = "https://staging.example.com"
    route = respx.post(f"{custom}/api/auto-incorporate").mock(
        return_value=httpx.Response(200, json=_SUCCESS_BODY)
    )
    incorporate(
        denominacion="ACME-AI SAS",
        tipo="SAS",
        capital_social=200_000,
        objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
        base_url=custom,
    )
    assert route.called


def test_incorporate_no_args_raises_typeerror():
    with pytest.raises(TypeError):
        incorporate()  # type: ignore[call-overload]


def test_incorporate_dataclass_plus_kwargs_raises_typeerror():
    with pytest.raises(TypeError):
        incorporate(
            IncorporateInput(
                denominacion="x",
                tipo="SAS",
                capital_social=1,
                objeto="abcdefghijklmnopqrst",
            ),
            denominacion="y",  # contradiction
        )


# ─── incorporate_or_throw() ─────────────────────────────────────────────────


@respx.mock
def test_incorporate_or_throw_returns_success():
    respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(200, json=_SUCCESS_BODY)
    )
    result = incorporate_or_throw(
        denominacion="ACME-AI SAS",
        tipo="SAS",
        capital_social=200_000,
        objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
    )
    assert result.sociedad.slug == "acme-ai-sas"


@respx.mock
def test_incorporate_or_throw_raises_validation_error():
    respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(422, json=_VALIDATION_FAILURE_BODY)
    )
    with pytest.raises(IncorporateValidationError) as exc:
        incorporate_or_throw(
            denominacion="ACME Nacional SAS",
            tipo="SAS",
            capital_social=200_000,
            objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
        )
    assert exc.value.findings[0].code == "denominacion_reserved_word"


# ─── describe() / fetch_audit() ─────────────────────────────────────────────


@respx.mock
def test_describe_success():
    body = {"endpoint": "/api/auto-incorporate", "method": "POST"}
    respx.get(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(200, json=body)
    )
    result = describe()
    assert result["endpoint"] == "/api/auto-incorporate"


@respx.mock
def test_fetch_audit_basic():
    body = {"sessionId": "abc12345", "count": 0, "entries": []}
    respx.get(f"{DEFAULT_BASE_URL}/api/play/audit/abc12345").mock(
        return_value=httpx.Response(200, json=body)
    )
    result = fetch_audit("abc12345")
    assert result["sessionId"] == "abc12345"


@respx.mock
def test_fetch_audit_with_verify_appends_query():
    body = {"sessionId": "abc12345", "count": 0, "entries": []}
    route = respx.get(f"{DEFAULT_BASE_URL}/api/play/audit/abc12345").mock(
        return_value=httpx.Response(200, json=body)
    )
    fetch_audit("abc12345", verify=True)
    assert route.called
    # request URL has ?verify=1
    url = str(route.calls[0].request.url)
    assert "?verify=1" in url
