"""
Async surface tests. Mirrors test_client.py for the aincorporate /
aincorporate_or_throw / adescribe / afetch_audit functions.
"""

from __future__ import annotations

import httpx
import pytest
import respx

from ar_agents_incorporate import (
    DEFAULT_BASE_URL,
    IncorporateError,
    IncorporateValidationError,
    adescribe,
    afetch_audit,
    aincorporate,
    aincorporate_or_throw,
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
    "config": {"package.json": "{}"},
    "envVars": [],
    "checklist": [],
    "deploy": {
        "target": "vercel",
        "oneClickUrl": "https://x",
        "sourceUrl": "https://y",
        "manualSteps": [],
    },
    "audit": {
        "sessionId": "s",
        "backend": "in-memory",
        "entry": {
            "id": "id-1",
            "sessionId": "s",
            "ts": "2026-05-09T12:00:00Z",
            "tool": "auto_incorporate",
            "governance": "audit-logged",
            "input": {},
            "output": {},
            "hmac": None,
            "durationMs": 1,
        },
        "url": "u",
        "verifyUrl": "v",
        "dashboardUrl": "d",
    },
    "rfc001": {"version": "1.0", "url": "r"},
    "generatedAt": "2026-05-09T12:00:00Z",
}


_VALIDATION_FAILURE_BODY = {
    "ok": False,
    "validation": {
        "valid": False,
        "findings": [
            {
                "code": "capital_below_minimum",
                "severity": "error",
                "field": "capitalSocial",
                "message": "too low",
            }
        ],
    },
    "rfc001": {"version": "1.0", "url": "r"},
}


@respx.mock
async def test_aincorporate_success():
    respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(200, json=_SUCCESS_BODY)
    )
    result = await aincorporate(
        denominacion="ACME-AI SAS",
        tipo="SAS",
        capital_social=200_000,
        objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
    )
    assert result.ok is True
    assert result.sociedad.slug == "acme-ai-sas"


@respx.mock
async def test_aincorporate_validation_failure():
    respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(422, json=_VALIDATION_FAILURE_BODY)
    )
    result = await aincorporate(
        denominacion="ACME-AI SAS",
        tipo="SAS",
        capital_social=1,  # below minimum for SAS
        objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
    )
    assert result.ok is False


@respx.mock
async def test_aincorporate_500_raises():
    respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(500, text="boom")
    )
    with pytest.raises(IncorporateError):
        await aincorporate(
            denominacion="ACME-AI SAS",
            tipo="SAS",
            capital_social=200_000,
            objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
        )


@respx.mock
async def test_aincorporate_or_throw_raises_validation():
    respx.post(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(422, json=_VALIDATION_FAILURE_BODY)
    )
    with pytest.raises(IncorporateValidationError):
        await aincorporate_or_throw(
            denominacion="ACME-AI SAS",
            tipo="SAS",
            capital_social=1,
            objeto="Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
        )


@respx.mock
async def test_adescribe_success():
    respx.get(f"{DEFAULT_BASE_URL}/api/auto-incorporate").mock(
        return_value=httpx.Response(200, json={"endpoint": "/api/auto-incorporate"})
    )
    result = await adescribe()
    assert result["endpoint"] == "/api/auto-incorporate"


@respx.mock
async def test_afetch_audit_with_verify():
    route = respx.get(f"{DEFAULT_BASE_URL}/api/play/audit/abc12345").mock(
        return_value=httpx.Response(200, json={"count": 0})
    )
    await afetch_audit("abc12345", verify=True)
    assert route.called
    assert "?verify=1" in str(route.calls[0].request.url)
