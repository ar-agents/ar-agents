"""
HTTP client + dataclasses for the /api/auto-incorporate endpoint.

Sync + async surfaces. Both use httpx under the hood. The dataclasses
mirror the JSON shape the server returns; we deliberately use snake_case
on the Python side and translate at the boundary so callers don't have
to think about JS conventions.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Literal, Sequence

import httpx

DEFAULT_BASE_URL = "https://ar-agents.vercel.app"
USER_AGENT = "ar-agents-incorporate/0.1.0 (https://ar-agents.vercel.app/sdk)"

SocietyType = Literal["SAS", "SRL", "SA", "SOCIEDAD-IA"]
PiezaId = Literal[
    "identity",
    "identity-attest",
    "mi-argentina",
    "firma-digital",
    "gde-tad",
    "mercadopago",
    "mercadolibre",
    "banking",
    "facturacion",
    "igj",
    "boletin-oficial",
    "whatsapp",
    "shipping",
    "agentic-commerce-bridge",
    "ap2",
    "mcp",
]

PIEZA_IDS: tuple[PiezaId, ...] = (
    "identity",
    "identity-attest",
    "mi-argentina",
    "firma-digital",
    "gde-tad",
    "mercadopago",
    "mercadolibre",
    "banking",
    "facturacion",
    "igj",
    "boletin-oficial",
    "whatsapp",
    "shipping",
    "agentic-commerce-bridge",
    "ap2",
    "mcp",
)

REQUIRED_PIEZAS: tuple[PiezaId, ...] = (
    "identity",
    "gde-tad",
    "mercadopago",
    "banking",
    "facturacion",
)

# ─────────────────────────────────────────────────────────────────────────────
# Input
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class Representante:
    """Human representative for the AR legal-facade layer per RFC-001 § 3.1."""

    nombre: str
    cuit: str

    def to_payload(self) -> dict[str, str]:
        return {"nombre": self.nombre, "cuit": self.cuit}


@dataclass(slots=True)
class IncorporateInput:
    """
    Body for the POST /api/auto-incorporate request. Mirrors the same shape
    the npm @ar-agents/incorporate client uses, with snake_case fields on
    the Python side.
    """

    denominacion: str
    tipo: SocietyType
    capital_social: float
    objeto: str
    representante: Representante | None = None
    email_contacto: str | None = None
    piezas: Sequence[PiezaId] | None = None
    session_id: str | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "denominacion": self.denominacion,
            "tipo": self.tipo,
            "capitalSocial": self.capital_social,
            "objeto": self.objeto,
        }
        if self.representante is not None:
            payload["representante"] = self.representante.to_payload()
        if self.email_contacto is not None:
            payload["emailContacto"] = self.email_contacto
        if self.piezas is not None:
            payload["piezas"] = list(self.piezas)
        if self.session_id is not None:
            payload["sessionId"] = self.session_id
        return payload


# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class ValidationFinding:
    code: str
    severity: Literal["error", "warning"]
    field: str
    message: str

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "ValidationFinding":
        return cls(
            code=data["code"],
            severity=data["severity"],
            field=data["field"],
            message=data["message"],
        )


@dataclass(frozen=True, slots=True)
class ValidationResult:
    valid: bool
    findings: list[ValidationFinding]

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "ValidationResult":
        return cls(
            valid=bool(data.get("valid", False)),
            findings=[ValidationFinding.from_json(f) for f in data.get("findings", [])],
        )


@dataclass(frozen=True, slots=True)
class Sociedad:
    denominacion: str
    tipo: SocietyType
    capital_social: float
    slug: str

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "Sociedad":
        return cls(
            denominacion=data["denominacion"],
            tipo=data["tipo"],
            capital_social=float(data["capitalSocial"]),
            slug=data["slug"],
        )


@dataclass(frozen=True, slots=True)
class EnvVar:
    name: str
    description: str

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "EnvVar":
        return cls(name=data["name"], description=data["description"])


@dataclass(frozen=True, slots=True)
class Deploy:
    target: str
    one_click_url: str
    source_url: str
    manual_steps: list[str]

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "Deploy":
        return cls(
            target=data["target"],
            one_click_url=data["oneClickUrl"],
            source_url=data["sourceUrl"],
            manual_steps=list(data.get("manualSteps", [])),
        )


@dataclass(frozen=True, slots=True)
class AuditEntry:
    id: str
    session_id: str
    ts: str
    tool: str
    governance: str
    input: Any
    output: Any | None
    hmac: str | None
    duration_ms: int | None

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "AuditEntry":
        return cls(
            id=data["id"],
            session_id=data["sessionId"],
            ts=data["ts"],
            tool=data["tool"],
            governance=data["governance"],
            input=data.get("input"),
            output=data.get("output"),
            hmac=data.get("hmac"),
            duration_ms=data.get("durationMs"),
        )


@dataclass(frozen=True, slots=True)
class AuditReference:
    session_id: str
    backend: Literal["vercel-kv", "in-memory"]
    entry: AuditEntry
    url: str
    verify_url: str
    dashboard_url: str

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "AuditReference":
        return cls(
            session_id=data["sessionId"],
            backend=data["backend"],
            entry=AuditEntry.from_json(data["entry"]),
            url=data["url"],
            verify_url=data["verifyUrl"],
            dashboard_url=data["dashboardUrl"],
        )


@dataclass(frozen=True, slots=True)
class Rfc001:
    version: str
    url: str

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "Rfc001":
        return cls(version=data["version"], url=data["url"])


@dataclass(frozen=True, slots=True)
class IncorporateSuccess:
    """The successful 200 OK response."""

    ok: Literal[True]
    sociedad: Sociedad
    validation: ValidationResult
    config: dict[str, str]
    env_vars: list[EnvVar]
    checklist: list[str]
    deploy: Deploy
    audit: AuditReference
    rfc001: Rfc001
    generated_at: str

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "IncorporateSuccess":
        return cls(
            ok=True,
            sociedad=Sociedad.from_json(data["sociedad"]),
            validation=ValidationResult.from_json(data["validation"]),
            config=dict(data["config"]),
            env_vars=[EnvVar.from_json(v) for v in data["envVars"]],
            checklist=list(data["checklist"]),
            deploy=Deploy.from_json(data["deploy"]),
            audit=AuditReference.from_json(data["audit"]),
            rfc001=Rfc001.from_json(data["rfc001"]),
            generated_at=data["generatedAt"],
        )


@dataclass(frozen=True, slots=True)
class IncorporateValidationFailure:
    """The 422 validation-failure response."""

    ok: Literal[False]
    validation: ValidationResult
    rfc001: Rfc001

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "IncorporateValidationFailure":
        return cls(
            ok=False,
            validation=ValidationResult.from_json(data["validation"]),
            rfc001=Rfc001.from_json(data["rfc001"]),
        )


IncorporateResult = IncorporateSuccess | IncorporateValidationFailure


# ─────────────────────────────────────────────────────────────────────────────
# Errors
# ─────────────────────────────────────────────────────────────────────────────


class IncorporateError(Exception):
    """Raised on network errors or unexpected (non-200/422) HTTP statuses."""

    def __init__(self, message: str, status: int, response: Any) -> None:
        super().__init__(message)
        self.status = status
        self.response = response


class IncorporateValidationError(Exception):
    """Raised by *_or_throw helpers when the server returns 422."""

    def __init__(self, findings: list[ValidationFinding]) -> None:
        msgs = [f"{f.field}: {f.message}" for f in findings if f.severity == "error"]
        super().__init__(f"Validation failed: {'; '.join(msgs)}")
        self.findings = findings


# ─────────────────────────────────────────────────────────────────────────────
# Sync surface
# ─────────────────────────────────────────────────────────────────────────────


def _build_input(input: IncorporateInput | dict[str, Any], extra_kwargs: dict[str, Any]) -> dict[str, Any]:
    if isinstance(input, IncorporateInput):
        if extra_kwargs:
            raise TypeError(
                "Pass either an IncorporateInput dataclass OR keyword args, not both.",
            )
        return input.to_payload()
    if isinstance(input, dict):
        return input
    raise TypeError(f"Expected IncorporateInput or dict, got {type(input)!r}")


def _kwargs_to_payload(**kwargs: Any) -> dict[str, Any]:
    """Translate snake_case Python kwargs to the camelCase API surface."""
    if not kwargs:
        return {}
    payload: dict[str, Any] = {}
    if "denominacion" in kwargs:
        payload["denominacion"] = kwargs["denominacion"]
    if "tipo" in kwargs:
        payload["tipo"] = kwargs["tipo"]
    if "capital_social" in kwargs:
        payload["capitalSocial"] = kwargs["capital_social"]
    if "objeto" in kwargs:
        payload["objeto"] = kwargs["objeto"]
    if "representante" in kwargs:
        rep = kwargs["representante"]
        payload["representante"] = (
            rep.to_payload() if isinstance(rep, Representante) else dict(rep)
        )
    if "email_contacto" in kwargs:
        payload["emailContacto"] = kwargs["email_contacto"]
    if "piezas" in kwargs:
        payload["piezas"] = list(kwargs["piezas"])
    if "session_id" in kwargs:
        payload["sessionId"] = kwargs["session_id"]
    return payload


def _parse_response(response: httpx.Response) -> IncorporateResult:
    if response.status_code == 200:
        return IncorporateSuccess.from_json(response.json())
    if response.status_code == 422:
        return IncorporateValidationFailure.from_json(response.json())
    body: Any
    try:
        body = response.json()
    except Exception:
        body = response.text
    raise IncorporateError(
        f"auto-incorporate failed with HTTP {response.status_code}",
        response.status_code,
        body,
    )


def incorporate(
    input: IncorporateInput | dict[str, Any] | None = None,
    *,
    base_url: str = DEFAULT_BASE_URL,
    timeout_seconds: float = 30.0,
    headers: dict[str, str] | None = None,
    client: httpx.Client | None = None,
    **kwargs: Any,
) -> IncorporateResult:
    """
    Sync POST /api/auto-incorporate.

    Pass `input` as an `IncorporateInput` dataclass OR pass keyword args
    directly:

        incorporate(IncorporateInput(...))
        incorporate(denominacion="ACME-AI SAS", tipo="SOCIEDAD-IA", ...)

    Returns an `IncorporateSuccess` (HTTP 200) or `IncorporateValidationFailure`
    (HTTP 422). Raises `IncorporateError` for other HTTP statuses or network
    failures.
    """
    payload = _build_input(input, kwargs) if input is not None else _kwargs_to_payload(**kwargs)
    if not payload:
        raise TypeError("incorporate() requires an input or keyword args.")
    h = {"content-type": "application/json", "user-agent": USER_AGENT}
    if headers:
        h.update(headers)
    url = f"{base_url.rstrip('/')}/api/auto-incorporate"
    if client is not None:
        r = client.post(url, json=payload, headers=h, timeout=timeout_seconds)
    else:
        r = httpx.post(url, json=payload, headers=h, timeout=timeout_seconds)
    return _parse_response(r)


def incorporate_or_throw(
    input: IncorporateInput | dict[str, Any] | None = None,
    **kwargs: Any,
) -> IncorporateSuccess:
    """Same as `incorporate()` but raises `IncorporateValidationError` on 422."""
    result = incorporate(input, **kwargs)
    if isinstance(result, IncorporateValidationFailure):
        raise IncorporateValidationError(result.validation.findings)
    return result


def describe(
    *,
    base_url: str = DEFAULT_BASE_URL,
    timeout_seconds: float = 30.0,
    headers: dict[str, str] | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """GET /api/auto-incorporate — endpoint self-description."""
    h = {"user-agent": USER_AGENT}
    if headers:
        h.update(headers)
    url = f"{base_url.rstrip('/')}/api/auto-incorporate"
    if client is not None:
        r = client.get(url, headers=h, timeout=timeout_seconds)
    else:
        r = httpx.get(url, headers=h, timeout=timeout_seconds)
    if r.status_code != 200:
        raise IncorporateError(
            f"describe failed with HTTP {r.status_code}", r.status_code, r.text,
        )
    data: dict[str, Any] = r.json()
    return data


def fetch_audit(
    session_id: str,
    *,
    verify: bool = False,
    base_url: str = DEFAULT_BASE_URL,
    timeout_seconds: float = 30.0,
    headers: dict[str, str] | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """GET /api/play/audit/{session_id} — audit log for a session."""
    h = {"user-agent": USER_AGENT}
    if headers:
        h.update(headers)
    qs = "?verify=1" if verify else ""
    url = f"{base_url.rstrip('/')}/api/play/audit/{httpx.QueryParams({'_': session_id})._dict.get('_', session_id)}{qs}"
    # Use a simpler quote approach to avoid private API
    from urllib.parse import quote
    url = f"{base_url.rstrip('/')}/api/play/audit/{quote(session_id, safe='')}{qs}"
    if client is not None:
        r = client.get(url, headers=h, timeout=timeout_seconds)
    else:
        r = httpx.get(url, headers=h, timeout=timeout_seconds)
    if r.status_code != 200:
        raise IncorporateError(
            f"fetch_audit failed with HTTP {r.status_code}", r.status_code, r.text,
        )
    return r.json()


# ─────────────────────────────────────────────────────────────────────────────
# Async surface
# ─────────────────────────────────────────────────────────────────────────────


async def aincorporate(
    input: IncorporateInput | dict[str, Any] | None = None,
    *,
    base_url: str = DEFAULT_BASE_URL,
    timeout_seconds: float = 30.0,
    headers: dict[str, str] | None = None,
    client: httpx.AsyncClient | None = None,
    **kwargs: Any,
) -> IncorporateResult:
    """Async equivalent of `incorporate()`."""
    payload = _build_input(input, kwargs) if input is not None else _kwargs_to_payload(**kwargs)
    if not payload:
        raise TypeError("aincorporate() requires an input or keyword args.")
    h = {"content-type": "application/json", "user-agent": USER_AGENT}
    if headers:
        h.update(headers)
    url = f"{base_url.rstrip('/')}/api/auto-incorporate"
    if client is not None:
        r = await client.post(url, json=payload, headers=h, timeout=timeout_seconds)
    else:
        async with httpx.AsyncClient(timeout=timeout_seconds) as c:
            r = await c.post(url, json=payload, headers=h)
    return _parse_response(r)


async def aincorporate_or_throw(
    input: IncorporateInput | dict[str, Any] | None = None,
    **kwargs: Any,
) -> IncorporateSuccess:
    """Async equivalent of `incorporate_or_throw()`."""
    result = await aincorporate(input, **kwargs)
    if isinstance(result, IncorporateValidationFailure):
        raise IncorporateValidationError(result.validation.findings)
    return result


async def adescribe(
    *,
    base_url: str = DEFAULT_BASE_URL,
    timeout_seconds: float = 30.0,
    headers: dict[str, str] | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Async equivalent of `describe()`."""
    h = {"user-agent": USER_AGENT}
    if headers:
        h.update(headers)
    url = f"{base_url.rstrip('/')}/api/auto-incorporate"
    if client is not None:
        r = await client.get(url, headers=h, timeout=timeout_seconds)
    else:
        async with httpx.AsyncClient(timeout=timeout_seconds) as c:
            r = await c.get(url, headers=h)
    if r.status_code != 200:
        raise IncorporateError(
            f"adescribe failed with HTTP {r.status_code}", r.status_code, r.text,
        )
    data: dict[str, Any] = r.json()
    return data


async def afetch_audit(
    session_id: str,
    *,
    verify: bool = False,
    base_url: str = DEFAULT_BASE_URL,
    timeout_seconds: float = 30.0,
    headers: dict[str, str] | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Async equivalent of `fetch_audit()`."""
    from urllib.parse import quote

    h = {"user-agent": USER_AGENT}
    if headers:
        h.update(headers)
    qs = "?verify=1" if verify else ""
    url = f"{base_url.rstrip('/')}/api/play/audit/{quote(session_id, safe='')}{qs}"
    if client is not None:
        r = await client.get(url, headers=h, timeout=timeout_seconds)
    else:
        async with httpx.AsyncClient(timeout=timeout_seconds) as c:
            r = await c.get(url, headers=h)
    if r.status_code != 200:
        raise IncorporateError(
            f"afetch_audit failed with HTTP {r.status_code}", r.status_code, r.text,
        )
    return r.json()
