"use client";

import { useCallback, useEffect, useState } from "react";
import { SocietyCockpit } from "@/components/society-cockpit";
import { formatTokenCount, formatUsd } from "@/lib/ui/money";
import { useLocale } from "@/lib/ui/locale-context";

// Loose, defensive shapes for docs/CONTRACT.md's Society lifecycle + account
// usage responses. Optional fields render a fallback instead of throwing.
export interface GoodStandingLike {
  state?: string;
  score?: number | null;
  rating?: string | null;
}

export interface SocietyDeployLike {
  projectName?: string;
  url?: string;
  deployedAt?: string;
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
  deploy?: SocietyDeployLike | null;
}

interface DeployResponse {
  ok: boolean;
  error?: string;
  mode?: "manual" | "provisioned";
  oneClickUrl?: string;
  envFile?: string;
  agentApiKey?: string;
  projectName?: string;
  url?: string;
  deploymentState?: string;
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
  // Date formatting is not part of this item's scope: kept as es-AR
  // regardless of the UI locale.
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
  const { t, format } = useLocale();
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
  const [deploy, setDeploy] = useState<{
    loading: boolean;
    result: DeployResponse | null;
    error: string | null;
  }>({ loading: false, result: null, error: null });
  const [copiedEnvFile, setCopiedEnvFile] = useState(false);

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
        setApprovals({ loading: false, items: [], error: t("dashboard.approvals.error") });
        return;
      }
      setApprovals({ loading: false, items: body.approvals ?? [], error: null });
    } catch {
      setApprovals({ loading: false, items: [], error: t("dashboard.approvals.error") });
    }
  }, [token, t]);

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
        setUsage({ loading: false, data: null, error: t("dashboard.usage.error") });
        return;
      }
      setUsage({ loading: false, data: body, error: null });
    } catch {
      setUsage({ loading: false, data: null, error: t("dashboard.usage.error") });
    }
  }, [token, t]);

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
        setSuspendError(t("dashboard.suspend.applyError"));
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
      setSuspendError(t("error.server_unreachable"));
      setSuspendSubmitting(false);
    }
  }

  async function submitDeploy() {
    setDeploy({ loading: true, result: null, error: null });
    try {
      const res = await fetch("/api/society/deploy", { method: "POST", headers: authHeaders(token) });
      const body = (await res.json().catch(() => null)) as DeployResponse | null;
      if (!res.ok || !body?.ok) {
        setDeploy({
          loading: false,
          result: null,
          error:
            body?.error === "rate_limited"
              ? t("dashboard.agent.deployRateLimited")
              : t("dashboard.agent.deployError"),
        });
        return;
      }
      setDeploy({ loading: false, result: body, error: null });
      if (body.mode === "provisioned" && body.projectName && body.url) {
        const projectName = body.projectName;
        const url = body.url;
        setSociety((s) => ({ ...s, deploy: { projectName, url, deployedAt: new Date().toISOString() } }));
      }
    } catch {
      setDeploy({
        loading: false,
        result: null,
        error: t("error.server_unreachable"),
      });
    }
  }

  async function copyEnvFile() {
    const text = deploy.result?.envFile ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedEnvFile(true);
      setTimeout(() => setCopiedEnvFile(false), 2000);
    } catch {
      // best-effort; the textarea itself is still selectable by hand
    }
  }

  function toHttpUrl(u: string): string {
    return u.startsWith("http") ? u : `https://${u}`;
  }

  const isSuspended = society.suspended === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary */}
      <div className="card">
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", margin: "0 0 6px" }}>
          {t("dashboard.society.heading")}
        </p>
        <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>{society.denominacion ?? "-"}</h3>
        <p style={{ fontSize: 13, color: "var(--text-body)", margin: "0 0 10px" }}>
          {format("dashboard.society.subtitle", {
            tipo: society.tipo ?? "-",
            registryId: society.registryId ?? "-",
          })}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className={ratingBadgeClass(society.goodStanding?.rating)}>
            {society.goodStanding?.state ?? t("dashboard.goodStanding.noData")}
            {society.goodStanding?.rating ? ` · ${society.goodStanding.rating}` : ""}
          </span>
          <span className={isSuspended ? "badge badge-bad" : "badge badge-good"}>
            {isSuspended ? t("dashboard.status.suspended") : t("dashboard.status.active")}
          </span>
          {typeof society.pendingApprovals === "number" ? (
            <span className="badge badge-neutral">
              {format("dashboard.pendingApprovals.badge", { count: String(society.pendingApprovals) })}
            </span>
          ) : null}
        </div>
      </div>

      {/* "La sociedad en vivo" cockpit (M3-2): the primary founder-facing
          view of a running society, once it has a provisioned deploy.
          Replaces the raw deploy URL as the thing a founder reads. */}
      {society.deploy?.projectName ? <SocietyCockpit token={token} /> : null}

      {/* Agent deploy (M1-6): the society's own runtime, deployed from studio */}
      <div className="card">
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>{t("dashboard.agent.heading")}</p>
        {society.deploy?.url ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              {format("dashboard.agent.projectInfo", {
                project: society.deploy.projectName ?? "-",
                date: formatDate(society.deploy.deployedAt),
              })}
            </p>
            {/* The cockpit above is the primary founder-facing view (M3-2);
                this is a small escape hatch for anyone who wants the raw
                deploy URL, not the main way to check on the society. */}
            <a
              href={toHttpUrl(society.deploy.url)}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, color: "var(--text-muted)" }}
            >
              {t("dashboard.agent.viewDeployTechnical")}
            </a>
          </div>
        ) : deploy.result?.mode === "provisioned" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ fontSize: 13, color: "var(--text-body)", margin: 0 }}>
              {format("dashboard.agent.deployState", { state: deploy.result.deploymentState ?? "-" })}
            </p>
            {deploy.result.url ? (
              <p style={{ fontSize: 13, margin: 0 }}>
                <a href={toHttpUrl(deploy.result.url)} target="_blank" rel="noreferrer">
                  {deploy.result.url}
                </a>
              </p>
            ) : null}
          </div>
        ) : deploy.result?.mode === "manual" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              {t("dashboard.agent.manualExplain")}
            </p>
            <a
              className="btn btn-primary"
              href={deploy.result.oneClickUrl}
              target="_blank"
              rel="noreferrer"
              style={{ textAlign: "center" }}
            >
              {t("dashboard.agent.deployToVercel")}
            </a>
            <div>
              <label className="field-label" htmlFor="deploy-env-file">
                {t("dashboard.agent.envVarsLabel")}
              </label>
              <textarea
                id="deploy-env-file"
                className="field-input"
                readOnly
                rows={4}
                value={deploy.result.envFile ?? ""}
                style={{ fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "4px 8px", marginTop: 6 }}
                onClick={() => void copyEnvFile()}
              >
                {copiedEnvFile ? t("action.copied") : t("dashboard.agent.copyEnvVars")}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
              {t("dashboard.agent.saveKeyWarning")}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              {t("dashboard.agent.notDeployedYet")}
            </p>
            {deploy.error ? <p className="field-error">{deploy.error}</p> : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={deploy.loading}
              onClick={() => void submitDeploy()}
            >
              {deploy.loading ? t("dashboard.agent.deploying") : t("dashboard.agent.deployCta")}
            </button>
          </div>
        )}
      </div>

      {/* Approvals */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{t("dashboard.approvals.heading")}</p>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={refreshApprovals}>
            {t("action.refresh")}
          </button>
        </div>
        {approvals.loading ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{t("society.loading")}</p>
        ) : approvals.error ? (
          <p className="field-error">{approvals.error}</p>
        ) : approvals.items.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {t("dashboard.approvals.empty")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {approvals.items.map((a) => (
              <div key={a.id} style={{ borderTop: "1px solid var(--border-color)", paddingTop: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 2px" }}>
                  {a.tool ?? t("dashboard.approvals.defaultTool")}
                </p>
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
                    {t("action.approve")}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 12, padding: "6px 10px" }}
                    disabled={resolvingId === a.id}
                    onClick={() => void resolveApproval(a.id, false)}
                  >
                    {t("action.deny")}
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
          {t("dashboard.killswitch.heading")}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>
          {t("dashboard.killswitch.explain")}
        </p>
        <button
          type="button"
          className={isSuspended ? "btn btn-primary" : "btn btn-danger"}
          onClick={() => setSuspendDialog({ open: true, toValue: !isSuspended })}
        >
          {isSuspended ? t("action.resume") : t("dashboard.suspend.action")}
        </button>
      </div>

      {/* Usage / billing math */}
      <div className="card">
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>{t("dashboard.usage.heading")}</p>
        {usage.loading ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{t("society.loading")}</p>
        ) : usage.error ? (
          <p className="field-error">{usage.error}</p>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-body)", display: "flex", flexDirection: "column", gap: 4 }}>
            <span>
              {format("dashboard.usage.tokens", {
                inTok: formatTokenCount(usage.data?.usage?.inputTokens ?? 0),
                outTok: formatTokenCount(usage.data?.usage?.outputTokens ?? 0),
              })}
            </span>
            <span>
              {format("dashboard.usage.realCost", { cost: formatUsd(usage.data?.usage?.costMicroUsd ?? 0) })}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              {format("dashboard.usage.priceIfOperative", {
                price: formatUsd(usage.data?.usage?.priceMicroUsd ?? 0),
              })}
            </span>
            {typeof usage.data?.cap?.remainingMicroUsd === "number" ? (
              <span style={{ color: "var(--text-muted)" }}>
                {format("dashboard.usage.capRemaining", {
                  remaining: formatUsd(usage.data.cap.remainingMicroUsd),
                })}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {suspendDialog.open ? (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog">
            <h3 style={{ fontSize: 16, margin: "0 0 6px" }}>
              {suspendDialog.toValue ? t("dashboard.suspend.action") : t("dashboard.resume.title")}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
              {suspendDialog.toValue
                ? t("dashboard.suspend.explainWill")
                : t("dashboard.suspend.explainResume")}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="motivo">
                {t("dashboard.suspend.reasonLabel")}
              </label>
              <input
                id="motivo"
                className="field-input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={t("dashboard.suspend.reasonPlaceholder")}
              />
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={aceptaSuspend}
                onChange={(e) => setAceptaSuspend(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>{t("dashboard.suspend.confirmCheckbox")}</span>
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
                {t("action.cancel")}
              </button>
              <button
                type="button"
                className={suspendDialog.toValue ? "btn btn-danger" : "btn btn-primary"}
                disabled={!aceptaSuspend || suspendSubmitting}
                onClick={() => void submitSuspend()}
              >
                {suspendSubmitting ? t("dashboard.suspend.applying") : t("action.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
