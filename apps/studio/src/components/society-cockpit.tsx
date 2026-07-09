"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/ui/locale-context";
import type { MessageId } from "@/lib/ui/i18n";

interface ActivityDeploy {
  available: boolean;
  projectName: string | null;
  url: string | null;
  state: string | null;
}
interface ActivitySociety {
  available: boolean;
  denominacion: string | null;
  version: string | null;
  uptimeSeconds: number | null;
}
interface ActivityClients {
  available: boolean;
  statuses: Record<string, string> | null;
}
interface ActivityKillSwitch {
  available: boolean;
  suspended: boolean | null;
}
interface ActivityApprovalItem {
  id: string;
  tool: string;
  status: string;
  createdAt: string;
}
interface ActivityApprovals {
  available: boolean;
  pendingCount: number | null;
  items: ActivityApprovalItem[] | null;
}
interface ActivityAuditEntry {
  id: string;
  ts: string;
  tool: string;
  governance: string;
  errored: boolean;
}
interface ActivityAudit {
  available: boolean;
  entries: ActivityAuditEntry[] | null;
}

interface ActivityResponse {
  ok: boolean;
  error?: string;
  deploy?: ActivityDeploy;
  society?: ActivitySociety;
  clients?: ActivityClients;
  killSwitch?: ActivityKillSwitch;
  approvals?: ActivityApprovals;
  audit?: ActivityAudit;
  provisioning?: boolean;
}

const REFRESH_INTERVAL_MS = 60_000;

function authHeaders(token: string): HeadersInit {
  return { "x-studio-token": token };
}

const DEPLOY_STATE_LABEL: Record<string, MessageId> = {
  READY: "cockpit.deploy.state.ready",
  BUILDING: "cockpit.deploy.state.building",
  QUEUED: "cockpit.deploy.state.queued",
  INITIALIZING: "cockpit.deploy.state.initializing",
  ERROR: "cockpit.deploy.state.error",
  CANCELED: "cockpit.deploy.state.canceled",
  BLOCKED: "cockpit.deploy.state.blocked",
};

function deployBadgeClass(state: string | null): string {
  if (!state) return "badge badge-neutral";
  if (state === "READY") return "badge badge-good";
  if (state === "ERROR" || state === "CANCELED" || state === "BLOCKED") return "badge badge-bad";
  return "badge badge-neutral";
}

/** "2h 14m" / "45m" / "<1m": a plain duration, language-neutral units. */
function formatUptime(seconds: number): string {
  if (seconds < 60) return "<1m";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * "La sociedad en vivo": the founder-facing cockpit (ROADMAP.md M3-2),
 * replacing the raw deploy URL as the primary way to see what a running
 * society is doing. Renders only once a project has been provisioned (see
 * src/components/operation-dashboard.tsx); before that there is nothing to
 * show yet. Auto-refreshes on focus and every 60s, no more aggressively.
 */
export function SocietyCockpit({ token }: { token: string }) {
  const { t, format } = useLocale();
  const [state, setState] = useState<{
    status: "loading" | "loaded" | "error";
    data: ActivityResponse | null;
  }>({ status: "loading", data: null });
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/society/activity", { headers: authHeaders(token) });
      const body = (await res.json().catch(() => null)) as ActivityResponse | null;
      if (!mountedRef.current) return;
      if (!res.ok || !body?.ok) {
        setState({ status: "error", data: null });
        return;
      }
      setState({ status: "loaded", data: body });
    } catch {
      if (mountedRef.current) setState({ status: "error", data: null });
    }
  }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState only after the network round trip
    void load();
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  if (state.status === "loading") {
    return (
      <div className="card">
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>{t("cockpit.heading")}</p>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{t("society.loading")}</p>
      </div>
    );
  }

  if (state.status === "error" || !state.data) {
    return (
      <div className="card">
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>{t("cockpit.heading")}</p>
        <p className="field-error">{t("error.server_unreachable")}</p>
      </div>
    );
  }

  const { deploy, society, clients, killSwitch, approvals, audit, provisioning } = state.data;

  const clientEntries = clients?.statuses ? Object.entries(clients.statuses) : [];
  const wiredCount = clientEntries.filter(([, v]) => v === "wired").length;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{t("cockpit.heading")}</p>
        {deploy ? <span className={deployBadgeClass(deploy.state)}>{t(DEPLOY_STATE_LABEL[deploy.state ?? ""] ?? "cockpit.unavailable")}</span> : null}
      </div>
      {society?.available && society.version ? (
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" }}>
          {format("cockpit.subtitle", {
            version: society.version,
            uptime: typeof society.uptimeSeconds === "number" ? formatUptime(society.uptimeSeconds) : "-",
          })}
        </p>
      ) : (
        <div style={{ marginBottom: 12 }} />
      )}

      {provisioning ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>{t("cockpit.provisioning")}</p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Client wiring */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>{t("cockpit.clients.heading")}</p>
          {clients?.available ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--text-body)" }}>
                {format("cockpit.clients.summary", { wired: String(wiredCount), total: String(clientEntries.length) })}
              </span>
              {wiredCount < clientEntries.length ? (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("cockpit.clients.hint")}</span>
              ) : null}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("cockpit.unavailable")}</span>
          )}
        </div>

        {/* Kill switch */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>{t("cockpit.killswitch.heading")}</p>
          {killSwitch?.available ? (
            <span className={killSwitch.suspended ? "badge badge-bad" : "badge badge-good"}>
              {killSwitch.suspended ? t("dashboard.status.suspended") : t("dashboard.status.active")}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("cockpit.unavailable")}</span>
          )}
        </div>

        {/* Approvals */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>{t("cockpit.approvals.heading")}</p>
          {approvals?.available ? (
            <span style={{ fontSize: 12, color: "var(--text-body)" }}>
              {approvals.pendingCount ? format("cockpit.approvals.summary", { count: String(approvals.pendingCount) }) : t("cockpit.approvals.empty")}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("cockpit.unavailable")}</span>
          )}
        </div>

        {/* Recent actions (signed audit log) */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>{t("cockpit.audit.heading")}</p>
          {audit?.available ? (
            audit.entries && audit.entries.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {audit.entries.slice(0, 8).map((e) => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--text-body)" }}>
                      <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{e.tool}</code>
                      {e.errored ? ` · ${t("cockpit.audit.errored")}` : ""}
                    </span>
                    <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatEntryDate(e.ts)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("cockpit.audit.empty")}</span>
            )
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("cockpit.unavailable")}</span>
          )}
        </div>

        {/* Usage / treasury placeholder */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>{t("cockpit.usage.heading")}</p>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("cockpit.usage.unavailable")}</span>
        </div>
      </div>
    </div>
  );
}
