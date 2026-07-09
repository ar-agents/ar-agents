"use client";

import { useCallback, useEffect, useState } from "react";
import { INTEGRATION_IDS, type IntegrationId } from "@/lib/credential-integrations";
import { useLocale } from "@/lib/ui/locale-context";
import type { MessageId } from "@/lib/ui/i18n";

interface CredentialMetaLike {
  configured?: boolean;
  verified?: boolean;
  maskedHint?: string | null;
  modelChoice?: "platform" | "own";
}

interface CredentialsResponse {
  ok: boolean;
  error?: string;
  credentials?: Record<IntegrationId, CredentialMetaLike | null>;
  deployProjectName?: string | null;
}

interface SaveResponse {
  ok: boolean;
  error?: string;
  message?: string;
  integration?: IntegrationId;
  status?: CredentialMetaLike;
  redeploy?: { triggered: boolean; state?: string; error?: string };
}

function authHeaders(token: string): HeadersInit {
  return { "x-studio-token": token };
}

const LABEL_ID: Record<IntegrationId, MessageId> = {
  model_key: "credentials.modelKey.label",
  mercadopago: "credentials.mercadopago.label",
  whatsapp: "credentials.whatsapp.label",
  afip: "credentials.afip.label",
  treasury_offramp: "credentials.treasury.label",
};

type FormState = Record<string, string>;

/**
 * The "Credenciales" section of the studio society view (ROADMAP.md M3-1):
 * one row per integration with a status pill, and a focused form for
 * whichever ONE the owner clicks into. Fields never round-trip back from the
 * server (the response never contains a secret, only metadata), so a saved
 * form's inputs are cleared rather than re-populated.
 */
export function CredentialsPanel({ token }: { token: string }) {
  const { t, format } = useLocale();
  const [state, setState] = useState<{
    status: "loading" | "loaded" | "error";
    credentials: Record<IntegrationId, CredentialMetaLike | null>;
    deployProjectName: string | null;
  }>({ status: "loading", credentials: {} as Record<IntegrationId, CredentialMetaLike | null>, deployProjectName: null });
  const [active, setActive] = useState<IntegrationId | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [modelChoice, setModelChoice] = useState<"platform" | "own">("platform");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<{ verified: boolean; redeploy: SaveResponse["redeploy"] } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/society/credentials", { headers: authHeaders(token) });
      const body = (await res.json().catch(() => null)) as CredentialsResponse | null;
      if (!res.ok || !body?.ok) {
        setState((s) => ({ ...s, status: "error" }));
        return;
      }
      setState({
        status: "loaded",
        credentials: body.credentials ?? ({} as Record<IntegrationId, CredentialMetaLike | null>),
        deployProjectName: body.deployProjectName ?? null,
      });
    } catch {
      setState((s) => ({ ...s, status: "error" }));
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  function openIntegration(id: IntegrationId) {
    setActive(id);
    setForm({});
    setModelChoice(state.credentials[id]?.modelChoice ?? "platform");
    setSaveError(null);
    setSaveNote(null);
  }

  function closeIntegration() {
    setActive(null);
    setForm({});
    setSaveError(null);
  }

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submitModelPlatform() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/society/credentials", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ integration: "model_key", modelChoice: "platform" }),
      });
      const body = (await res.json().catch(() => null)) as SaveResponse | null;
      if (!res.ok || !body?.ok) {
        setSaveError(t("credentials.error.saveFailed"));
        setSaving(false);
        return;
      }
      setState((s) => ({ ...s, credentials: { ...s.credentials, model_key: body.status ?? null } }));
      setSaveNote({ verified: false, redeploy: undefined });
      setSaving(false);
      closeIntegration();
    } catch {
      setSaveError(t("credentials.error.saveFailed"));
      setSaving(false);
    }
  }

  async function submitIntegration(id: IntegrationId, fields: FormState) {
    setSaving(true);
    setSaveError(null);
    setSaveNote(null);
    try {
      const body: Record<string, unknown> = { integration: id, fields };
      if (id === "model_key") body.modelChoice = "own";
      const res = await fetch("/api/society/credentials", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(body),
      });
      const responseBody = (await res.json().catch(() => null)) as SaveResponse | null;
      if (!res.ok || !responseBody?.ok) {
        setSaveError(
          responseBody?.error === "validation_failed"
            ? (responseBody.message ?? t("credentials.error.saveFailed"))
            : t("credentials.error.saveFailed"),
        );
        setSaving(false);
        return;
      }
      setState((s) => ({ ...s, credentials: { ...s.credentials, [id]: responseBody.status ?? null } }));
      setSaveNote({ verified: Boolean(responseBody.status?.verified), redeploy: responseBody.redeploy });
      setSaving(false);
      setActive(null);
      setForm({});
    } catch {
      setSaveError(t("credentials.error.saveFailed"));
      setSaving(false);
    }
  }

  function statusPill(id: IntegrationId) {
    const meta = state.credentials[id];
    if (!meta?.configured) {
      return <span className="badge badge-neutral">{t("credentials.status.missing")}</span>;
    }
    return (
      <span className="badge badge-good">
        {t("credentials.status.configured")}
        {meta.maskedHint ? ` · ${format("credentials.status.hint", { hint: meta.maskedHint })}` : ""}
      </span>
    );
  }

  function renderRow(id: IntegrationId) {
    const isActive = active === id;
    return (
      <div
        key={id}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          borderTop: "1px solid var(--border-color)",
          paddingTop: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{t(LABEL_ID[id])}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {statusPill(id)}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "4px 8px" }}
              onClick={() => (isActive ? closeIntegration() : openIntegration(id))}
            >
              {t(state.credentials[id]?.configured ? "credentials.action.edit" : "credentials.action.configure")}
            </button>
          </div>
        </div>
        {isActive ? renderForm(id) : null}
      </div>
    );
  }

  function renderForm(id: IntegrationId) {
    if (id === "model_key") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="radio"
                name="model-choice"
                checked={modelChoice === "platform"}
                onChange={() => setModelChoice("platform")}
              />
              {t("credentials.modelKey.choicePlatform")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="radio"
                name="model-choice"
                checked={modelChoice === "own"}
                onChange={() => setModelChoice("own")}
              />
              {t("credentials.modelKey.choiceOwn")}
            </label>
          </div>
          {modelChoice === "own" ? (
            <div>
              <label className="field-label" htmlFor="cred-model-apiKey">
                {t("credentials.modelKey.apiKeyLabel")}
              </label>
              <input
                id="cred-model-apiKey"
                className="field-input"
                type="password"
                value={form.apiKey ?? ""}
                onChange={(e) => setField("apiKey", e.target.value)}
                placeholder={t("credentials.modelKey.apiKeyPlaceholder")}
              />
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
                {t("credentials.modelKey.help")}
              </p>
            </div>
          ) : null}
          {saveError ? <p className="field-error">{saveError}</p> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={closeIntegration} disabled={saving}>
              {t("action.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || (modelChoice === "own" && !(form.apiKey ?? "").trim())}
              onClick={() =>
                void (modelChoice === "platform" ? submitModelPlatform() : submitIntegration(id, form))
              }
            >
              {saving ? t("credentials.action.saving") : t("credentials.action.save")}
            </button>
          </div>
        </div>
      );
    }

    if (id === "mercadopago") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="field-label" htmlFor="cred-mp-token">
              {t("credentials.mercadopago.accessTokenLabel")}
            </label>
            <input
              id="cred-mp-token"
              className="field-input"
              type="password"
              value={form.accessToken ?? ""}
              onChange={(e) => setField("accessToken", e.target.value)}
              placeholder="APP_USR-..."
            />
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              {t("credentials.mercadopago.help")}
            </p>
          </div>
          {saveError ? <p className="field-error">{saveError}</p> : null}
          {formActions(id, !(form.accessToken ?? "").trim())}
        </div>
      );
    }

    if (id === "whatsapp") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="field-label" htmlFor="cred-wa-token">
              {t("credentials.whatsapp.accessTokenLabel")}
            </label>
            <input
              id="cred-wa-token"
              className="field-input"
              type="password"
              value={form.accessToken ?? ""}
              onChange={(e) => setField("accessToken", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cred-wa-phone">
              {t("credentials.whatsapp.phoneNumberIdLabel")}
            </label>
            <input
              id="cred-wa-phone"
              className="field-input"
              value={form.phoneNumberId ?? ""}
              onChange={(e) => setField("phoneNumberId", e.target.value)}
              inputMode="numeric"
            />
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              {t("credentials.whatsapp.help")}
            </p>
          </div>
          {saveError ? <p className="field-error">{saveError}</p> : null}
          {formActions(id, !(form.accessToken ?? "").trim() || !(form.phoneNumberId ?? "").trim())}
        </div>
      );
    }

    if (id === "afip") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="field-label" htmlFor="cred-afip-cert">
              {t("credentials.afip.certLabel")}
            </label>
            <textarea
              id="cred-afip-cert"
              className="field-input"
              rows={3}
              style={{ fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
              value={form.certPem ?? ""}
              onChange={(e) => setField("certPem", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cred-afip-key">
              {t("credentials.afip.keyLabel")}
            </label>
            <textarea
              id="cred-afip-key"
              className="field-input"
              rows={3}
              style={{ fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
              value={form.keyPem ?? ""}
              onChange={(e) => setField("keyPem", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cred-afip-cuit">
              {t("credentials.afip.cuitLabel")}
            </label>
            <input
              id="cred-afip-cuit"
              className="field-input"
              value={form.cuit ?? ""}
              onChange={(e) => setField("cuit", e.target.value)}
              placeholder="20-12345678-6"
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cred-afip-env">
              {t("credentials.afip.envLabel")}
            </label>
            <select
              id="cred-afip-env"
              className="field-input"
              value={form.env ?? "homo"}
              onChange={(e) => setField("env", e.target.value)}
            >
              <option value="homo">{t("credentials.afip.envHomo")}</option>
              <option value="prod">{t("credentials.afip.envProd")}</option>
            </select>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              {t("credentials.afip.help")}
            </p>
          </div>
          {saveError ? <p className="field-error">{saveError}</p> : null}
          {formActions(id, !(form.certPem ?? "").trim() || !(form.keyPem ?? "").trim() || !(form.cuit ?? "").trim())}
        </div>
      );
    }

    // treasury_offramp
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label className="field-label" htmlFor="cred-treasury-key">
            {t("credentials.treasury.apiKeyLabel")}
          </label>
          <input
            id="cred-treasury-key"
            className="field-input"
            type="password"
            value={form.apiKey ?? ""}
            onChange={(e) => setField("apiKey", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="cred-treasury-user">
            {t("credentials.treasury.userIdLabel")}
          </label>
          <input
            id="cred-treasury-user"
            className="field-input"
            value={form.userId ?? ""}
            onChange={(e) => setField("userId", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="cred-treasury-account">
            {t("credentials.treasury.bankAccountIdLabel")}
          </label>
          <input
            id="cred-treasury-account"
            className="field-input"
            value={form.bankAccountId ?? ""}
            onChange={(e) => setField("bankAccountId", e.target.value)}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
            {t("credentials.treasury.help")}
          </p>
        </div>
        {saveError ? <p className="field-error">{saveError}</p> : null}
        {formActions(
          id,
          !(form.apiKey ?? "").trim() || !(form.userId ?? "").trim() || !(form.bankAccountId ?? "").trim(),
        )}
      </div>
    );
  }

  function formActions(id: IntegrationId, disabled: boolean) {
    return (
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={closeIntegration} disabled={saving}>
          {t("action.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || disabled}
          onClick={() => void submitIntegration(id, form)}
        >
          {saving ? t("credentials.action.saving") : t("credentials.action.save")}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>{t("credentials.heading")}</p>
      {state.status === "loading" ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{t("society.loading")}</p>
      ) : state.status === "error" ? (
        <p className="field-error">{t("credentials.error")}</p>
      ) : !state.deployProjectName ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("credentials.needsDeploy")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {saveNote ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 4px" }}>
              {saveNote.verified ? t("credentials.result.savedVerified") : t("credentials.result.savedUnverified")}
              {saveNote.redeploy?.triggered && saveNote.redeploy.state
                ? ` ${t("credentials.redeploy.ok")}`
                : saveNote.redeploy?.triggered && saveNote.redeploy.error
                  ? ` ${t("credentials.redeploy.error")}`
                  : saveNote.redeploy && !saveNote.redeploy.triggered
                    ? ` ${t("credentials.redeploy.unavailable")}`
                    : ""}
            </p>
          ) : null}
          {INTEGRATION_IDS.map(renderRow)}
        </div>
      )}
    </div>
  );
}
