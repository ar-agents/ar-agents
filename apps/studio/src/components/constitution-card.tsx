"use client";

import { useState } from "react";
import { formatArs } from "@/lib/ui/money";
import { isValidCuit, normalizeCuit } from "@/lib/ui/cuit";

// Loose, defensive shape for what the `preview_society` tool returns
// (docs/CONTRACT.md: "Returns the draft + checklist", forwarding
// apps/landing's POST /api/incorporate-preview). Every field is optional:
// this app never imports the backend's zod schema, so we render best-effort
// and fall back gracefully if a field is missing or renamed upstream.
export interface SocietyDraftLike {
  denominacion?: string;
  tipo?: string;
  capitalSocial?: number;
  objeto?: string;
  piezas?: string[];
  representante?: { nombre?: string; cuit?: string } | null;
  emailContacto?: string | null;
}

export interface PreviewSocietyOutput {
  ok?: boolean;
  sociedad?: { denominacion?: string; tipo?: string; capitalSocial?: number };
  draft?: SocietyDraftLike;
  checklist?: string[];
  note?: string;
}

interface ConstituteSuccess {
  ok: true;
  society?: Record<string, unknown>;
  credentials?: { adminToken?: string; gateToken?: string };
  deploy?: { oneClickUrl?: string };
}
interface ConstituteFailure {
  ok: false;
  error?: string;
  message?: string;
}

function errorCopy(status: number, body: ConstituteFailure | null): string {
  if (status === 409) {
    return "Esta cuenta ya tiene una sociedad constituida. Solo se puede constituir una por cuenta.";
  }
  if (body?.error === "art102_no_aceptado") {
    return "Falta aceptar la responsabilidad del art. 102.";
  }
  if (body?.error === "cuit_invalido") {
    return "El CUIT del administrador no es válido.";
  }
  if (body?.error === "administrador_invalido") {
    return "Falta el nombre del administrador.";
  }
  if (body?.error === "rate_limited") {
    return "Demasiados intentos. Esperá un rato y volvé a intentar.";
  }
  if (body?.message) return body.message;
  return "No se pudo constituir la sociedad. Probá de nuevo en un rato.";
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ fontSize: 12, padding: "5px 10px" }}
      onClick={async () => {
        const ok = await copyToClipboard(value);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? "Copiado" : label}
    </button>
  );
}

/**
 * Draft summary card rendered inline in the chat once a `preview_society`
 * tool result appears, plus the confirm dialog that turns it into a
 * (still pre-law, simulated) constitution via POST /api/society/constitute.
 */
export function ConstitutionCard({
  token,
  output,
  disabled,
  open,
  onOpenChange,
  onConstituted,
}: {
  token: string;
  output: PreviewSocietyOutput;
  /** True once the account already has a society: suppresses the CTA. */
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConstituted: (result: ConstituteSuccess) => void;
}) {
  const draft = output.draft ?? {};
  const denominacion = draft.denominacion ?? output.sociedad?.denominacion ?? "Sin nombre";
  const tipo = draft.tipo ?? output.sociedad?.tipo ?? "-";
  const capitalSocial = draft.capitalSocial ?? output.sociedad?.capitalSocial;
  const checklist = output.checklist ?? [];

  const [nombre, setNombre] = useState("");
  const [cuit, setCuit] = useState("");
  const [acepta102, setAcepta102] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<
    { adminToken?: string; gateToken?: string } | undefined
  >(undefined);

  const cuitDigits = normalizeCuit(cuit);
  const cuitValid = cuit.trim().length === 0 ? true : isValidCuit(cuit);
  const canSubmit =
    !submitting && nombre.trim().length >= 2 && isValidCuit(cuit) && acepta102;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/society/constitute", {
        method: "POST",
        headers: { "content-type": "application/json", "x-studio-token": token },
        body: JSON.stringify({
          draft,
          administrador: { nombre: nombre.trim(), cuit: cuitDigits },
          acepta102: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | ConstituteSuccess
        | ConstituteFailure
        | null;
      if (!res.ok || !body?.ok) {
        setError(errorCopy(res.status, (body as ConstituteFailure) ?? null));
        setSubmitting(false);
        return;
      }
      const success = body as ConstituteSuccess;
      setCredentials(success.credentials);
      setSubmitting(false);
      onConstituted(success);
    } catch {
      setError("No se pudo hablar con el servidor. Probá de nuevo en un rato.");
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Borrador de sociedad</p>
      <h3 style={{ fontSize: 17, margin: "4px 0 2px" }}>{denominacion}</h3>
      <p style={{ fontSize: 13, color: "var(--text-body)", margin: "0 0 10px" }}>
        {tipo}
        {typeof capitalSocial === "number"
          ? ` · capital social ${formatArs(capitalSocial)}`
          : ""}
      </p>
      {draft.objeto ? (
        <p style={{ fontSize: 13, color: "var(--text-body)", margin: "0 0 10px" }}>
          {draft.objeto}
        </p>
      ) : null}
      {draft.piezas && draft.piezas.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {draft.piezas.map((p) => (
            <span key={p} className="chip">
              {p}
            </span>
          ))}
        </div>
      ) : null}
      {checklist.length > 0 ? (
        <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13, color: "var(--text-body)" }}>
          {checklist.slice(0, 6).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : null}

      {disabled ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Esta cuenta ya tiene una sociedad constituida.
        </p>
      ) : credentials ? (
        <div
          className="card"
          style={{ background: "var(--bg)", borderColor: "var(--accent)", marginTop: 4 }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
            Guardá estas credenciales ahora: no se muestran de nuevo.
          </p>
          {credentials.adminToken ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <code style={{ fontSize: 12, wordBreak: "break-all" }}>
                {credentials.adminToken}
              </code>
              <CopyButton value={credentials.adminToken} label="Copiar admin" />
            </div>
          ) : null}
          {credentials.gateToken ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <code style={{ fontSize: 12, wordBreak: "break-all" }}>{credentials.gateToken}</code>
              <CopyButton value={credentials.gateToken} label="Copiar gate" />
            </div>
          ) : null}
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => onOpenChange(true)}>
          Constituir (borrador)
        </button>
      )}

      {open && !disabled && !credentials ? (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog">
            <h3 style={{ fontSize: 16, margin: "0 0 6px" }}>Constituir {denominacion}</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
              Pre-ley esto crea un registro simulado (BORRADOR): no presenta nada ante ningún
              organismo y no mueve dinero.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="admin-nombre">
                Nombre del administrador
              </label>
              <input
                id="admin-nombre"
                className="field-input"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre y apellido"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="admin-cuit">
                CUIT del administrador
              </label>
              <input
                id="admin-cuit"
                className="field-input"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                placeholder="20-12345678-6"
                inputMode="numeric"
              />
              {!cuitValid ? <p className="field-error">CUIT inválido.</p> : null}
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              <input
                type="checkbox"
                checked={acepta102}
                onChange={(e) => setAcepta102(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                Acepto la responsabilidad de administrador bajo el art. 102 (supervisión no
                delegable de la sociedad automatizada).
              </span>
            </label>

            {error ? <p className="field-error" style={{ marginBottom: 12 }}>{error}</p> : null}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submit}
                disabled={!canSubmit}
              >
                {submitting ? "Constituyendo..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
