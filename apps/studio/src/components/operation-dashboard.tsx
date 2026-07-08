"use client";

import { useCallback, useEffect, useState } from "react";
import { formatTokenCount, formatUsd } from "@/lib/ui/money";

// Loose, defensive shapes for docs/CONTRACT.md's Society lifecycle + account
// usage responses. Optional fields render a fallback instead of throwing.
export interface GoodStandingLike {
  state?: string;
  score?: number | null;
  rating?: string | null;
}

export interface SocietySummaryLike {
  sessionId?: string;
  denominacion?: string;
  tipo?: string;
  registryId?: string;
  createdAt?: string;
  goodStanding?: GoodStandingLike | null;
  suspended?: boolean | null;
  pendingApprovals?: number | null;
}

interface ApprovalItem {
  id: string;
  tool?: string;
  argsPreview?: string;
  status?: string;
  createdAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

interface UsageResponse {
  usage?: {
    month?: string;
    inputTokens?: number;
    outputTokens?: number;
    costMicroUsd?: number;
    priceMicroUsd?: number;
  };
  cap?: { monthlyCostMicroUsd?: number; remainingMicroUsd?: number };
}

function authHeaders(token: string): HeadersInit {
  return { "x-studio-token": token };
}

function ratingBadgeClass(rating: string | null | undefined): string {
  if (!rating || rating === "N/A") return "badge badge-neutral";
  if (rating.startsWith("A") || rating.startsWith("B")) return "badge badge-good";
  return "badge badge-bad";
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Right-column dashboard shown once the account has a society: status +
 * good standing, the pending-approvals queue, the art. 102 kill switch, and
 * the usage/billing-math card. Owns its own fetches; the parent only needs
 * to know a society exists (see src/app/page.tsx).
 */
export function OperationDashboard({
  token,
  initialSociety,
}: {
  token: string;
  initialSociety: SocietySummaryLike;
}) {
  const [society, setSociety] = useState<SocietySummaryLike>(initialSociety);
  const [approvals, setApprovals] = useState<{
    loading: boolean;
    items: ApprovalItem[];
    error: string | null;
  }>({ loading: true, items: [], error: null });
  const [usage, setUsage] = useState<{
    loading: boolean;
    data: UsageResponse | null;
    error: string | null;
  }>({ loading: true, data: null, error: null });
  const [suspendDialog, setSuspendDialog] = useState<{ open: boolean; toValue: boolean }>({
    open: false,
    toValue: true,
  });
  const [motivo, setMotivo] = useState("");
  const [aceptaSuspend, setAceptaSuspend] = useState(false);
  const [suspendSubmitting, setSuspendSubmitting] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Split fetch/refresh (see the matching comment in src/app/page.tsx): the
  // mount effect below calls the bare `fetchX` (no synchronous setState
  // before its first await, satisfying the set-state-in-effect lint rule
  // and relying on the useState initial value already being "loading");
  // the "Actualizar" button calls `refreshX`, which resets loading first
  // from a plain click handler.
  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/society/approvals", { headers: authHeaders(token) });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; approvals: ApprovalItem[] }
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setApprovals({ loading: false, items: [], error: "No se pudieron cargar las aprobaciones." });
        return;
      }
      setApprovals({ loading: false, items: body.approvals ?? [], error: null });
    } catch {
      setApprovals({ loading: false, items: [], error: "No se pudieron cargar las aprobaciones." });
    }
  }, [token]);

  const refreshApprovals = useCallback(() => {
    setApprovals((s) => ({ ...s, loading: true, error: null }));
    void fetchApprovals();
  }, [fetchApprovals]);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/account", { headers: authHeaders(token) });
      const body = (await res.json().catch(() => null)) as
        | ({ ok: true } & UsageResponse)
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setUsage({ loading: false, data: null, error: "No se pudo cargar el uso de la cuenta." });
        return;
      }
      setUsage({ loading: false, data: body, error: null });
    } catch {
      setUsage({ loading: false, data: null, error: "No se pudo cargar el uso de la cuenta." });
    }
  }, [token]);

  const loadSociety = useCallback(async () => {
    try {
      const res = await fetch("/api/society", { headers: authHeaders(token) });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; society: SocietySummaryLike | null }
        | { ok: false }
        | null;
      if (res.ok && body?.ok && body.society) setSociety(body.society);
    } catch {
      // best-effort refresh; keep whatever we already have
    }
  }, [token]);

  // Fetch-on-mount effect (see the matching note above fetchAccount in src/app/page.tsx):
  // setState happens after the network round trip, not synchronously.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void fetchApprovals();
    void fetchUsage();
  }, [fetchApprovals, fetchUsage]);

  async function resolveApproval(id: string, approved: boolean) {
    setResolvingId(id);
    try {
      const res = await fetch("/api/society/approvals", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ id, approved }),
      });
      if (res.ok) {
        setApprovals((s) => ({ ...s, items: s.items.filter((a) => a.id !== id) }));
        void loadSociety();
      }
    } finally {
      setResolvingId(null);
    }
  }

  async function submitSuspend() {
    if (!aceptaSuspend) return;
    setSuspendSubmitting(true);
    setSuspendError(null);
    try {
      const res = await fetch("/api/society/suspend", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
          suspend: suspendDialog.toValue,
          motivo: motivo.trim() || undefined,
          acepta: true,
        }),
      });
      if (!res.ok) {
        setSuspendError("No se pudo aplicar el cambio. Probá de nuevo en un rato.");
        setSuspendSubmitting(false);
        return;
      }
      setSociety((s) => ({ ...s, suspended: suspendDialog.toValue }));
      setSuspendDialog({ open: false, toValue: true });
      setMotivo("");
      setAceptaSuspend(false);
      setSuspendSubmitting(false);
      void loadSociety();
    } catch {
      setSuspendError("No se pudo hablar con el servidor. Probá de nuevo en un rato.");
      setSuspendSubmitting(false);
    }
  }

  const isSuspended = society.suspended === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary */}
      <div className="card">
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", margin: "0 0 6px" }}>
          Tu sociedad
        </p>
        <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>{society.denominacion ?? "-"}</h3>
        <p style={{ fontSize: 13, color: "var(--text-body)", margin: "0 0 10px" }}>
          {society.tipo ?? "-"} · registro {society.registryId ?? "-"}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className={ratingBadgeClass(society.goodStanding?.rating)}>
            {society.goodStanding?.state ?? "sin datos"}
            {society.goodStanding?.rating ? ` · ${society.goodStanding.rating}` : ""}
          </span>
          <span className={isSuspended ? "badge badge-bad" : "badge badge-good"}>
            {isSuspended ? "suspendida" : "activa"}
          </span>
          {typeof society.pendingApprovals === "number" ? (
            <span className="badge badge-neutral">{society.pendingApprovals} pendientes</span>
          ) : null}
        </div>
      </div>

      {/* Approvals */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Aprobaciones pendientes</p>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={refreshApprovals}>
            Actualizar
          </button>
        </div>
        {approvals.loading ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Cargando...</p>
        ) : approvals.error ? (
          <p className="field-error">{approvals.error}</p>
        ) : approvals.items.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            No hay aprobaciones pendientes.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {approvals.items.map((a) => (
              <div key={a.id} style={{ borderTop: "1px solid var(--border-color)", paddingTop: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 2px" }}>{a.tool ?? "acción"}</p>
                {a.argsPreview ? (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px", wordBreak: "break-word" }}>
                    {a.argsPreview}
                  </p>
                ) : null}
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
                  {formatDate(a.createdAt)}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: "6px 10px" }}
                    disabled={resolvingId === a.id}
                    onClick={() => void resolveApproval(a.id, true)}
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 12, padding: "6px 10px" }}
                    disabled={resolvingId === a.id}
                    onClick={() => void resolveApproval(a.id, false)}
                  >
                    Denegar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kill switch */}
      <div className="card">
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>
          Interruptor de emergencia
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>
          Como administrador (art. 102) podés suspender la sociedad en cualquier momento: mientras
          esté suspendida, el agente no puede ejecutar ninguna acción.
        </p>
        <button
          type="button"
          className={isSuspended ? "btn btn-primary" : "btn btn-danger"}
          onClick={() => setSuspendDialog({ open: true, toValue: !isSuspended })}
        >
          {isSuspended ? "Reanudar" : "Suspender sociedad"}
        </button>
      </div>

      {/* Usage / billing math */}
      <div className="card">
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Uso este mes</p>
        {usage.loading ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Cargando...</p>
        ) : usage.error ? (
          <p className="field-error">{usage.error}</p>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-body)", display: "flex", flexDirection: "column", gap: 4 }}>
            <span>
              Tokens: {formatTokenCount(usage.data?.usage?.inputTokens ?? 0)} entrada ·{" "}
              {formatTokenCount(usage.data?.usage?.outputTokens ?? 0)} salida
            </span>
            <span>Costo real: {formatUsd(usage.data?.usage?.costMicroUsd ?? 0)}</span>
            <span style={{ color: "var(--text-muted)" }}>
              Precio si estuviera operativa (5x): {formatUsd(usage.data?.usage?.priceMicroUsd ?? 0)}
            </span>
            {typeof usage.data?.cap?.remainingMicroUsd === "number" ? (
              <span style={{ color: "var(--text-muted)" }}>
                Te queda {formatUsd(usage.data.cap.remainingMicroUsd)} del límite gratuito de este
                mes.
              </span>
            ) : null}
          </div>
        )}
      </div>

      {suspendDialog.open ? (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog">
            <h3 style={{ fontSize: 16, margin: "0 0 6px" }}>
              {suspendDialog.toValue ? "Suspender sociedad" : "Reanudar sociedad"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
              {suspendDialog.toValue
                ? "Mientras esté suspendida, el agente de la sociedad no podrá ejecutar ninguna acción."
                : "La sociedad vuelve a poder operar normalmente."}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="motivo">
                Motivo (opcional)
              </label>
              <input
                id="motivo"
                className="field-input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: quiero revisar la actividad reciente"
              />
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={aceptaSuspend}
                onChange={(e) => setAceptaSuspend(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>Confirmo esta acción como administrador de la sociedad.</span>
            </label>
            {suspendError ? <p className="field-error" style={{ marginBottom: 12 }}>{suspendError}</p> : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={suspendSubmitting}
                onClick={() => {
                  setSuspendDialog({ open: false, toValue: true });
                  setSuspendError(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={suspendDialog.toValue ? "btn btn-danger" : "btn btn-primary"}
                disabled={!aceptaSuspend || suspendSubmitting}
                onClick={() => void submitSuspend()}
              >
                {suspendSubmitting ? "Aplicando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
