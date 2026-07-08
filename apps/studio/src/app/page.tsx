"use client";

import { useCallback, useEffect, useState } from "react";
import { Chat } from "@/components/chat";
import { JourneyRail } from "@/components/journey-rail";
import { OperationDashboard, type SocietySummaryLike } from "@/components/operation-dashboard";
import { ensureAccount, type StudioAccount } from "@/lib/ui/account-client";
import type { StageId } from "@/lib/ui/stage";

type AccountState =
  | { status: "loading" }
  | { status: "ready"; account: StudioAccount }
  | { status: "error" };

type SocietyState =
  | { status: "loading" }
  | { status: "loaded"; data: SocietySummaryLike | null }
  | { status: "error" };

export default function Home() {
  const [accountState, setAccountState] = useState<AccountState>({ status: "loading" });
  const [societyState, setSocietyState] = useState<SocietyState>({ status: "loading" });
  const [stage, setStage] = useState<StageId>("idea");

  // Note on the two-function split below (`fetchX` vs `retryX`): `fetchX` only
  // ever setStates with a fetch RESULT (never a synchronous "loading" reset),
  // so it stays a plain "fetch on mount, sync state with the result" effect -
  // the sanctioned effect use case per https://react.dev/learn/you-might-not-need-an-effect.
  // `retryX` additionally resets to "loading" before calling `fetchX`, but only
  // from the retry button's onClick (a plain event handler, not an effect).
  // eslint-plugin-react-hooks's set-state-in-effect rule still flags the
  // effect call below (it flags any setState reachable from an effect
  // callback at all, regardless of it happening after an awaited network
  // round trip rather than synchronously); disabled with that justification.
  const fetchAccount = useCallback(async () => {
    try {
      const account = await ensureAccount({ storage: window.localStorage });
      setAccountState({ status: "ready", account });
    } catch {
      setAccountState({ status: "error" });
    }
  }, []);

  const retryAccount = useCallback(() => {
    setAccountState({ status: "loading" });
    void fetchAccount();
  }, [fetchAccount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; see note above fetchAccount
    void fetchAccount();
  }, [fetchAccount]);

  const fetchSociety = useCallback((token: string) => {
    let cancelled = false;
    fetch("/api/society", { headers: { "x-studio-token": token } })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as
          | { ok: true; society: SocietySummaryLike | null }
          | { ok: false }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.ok) {
          setSocietyState({ status: "error" });
          return;
        }
        setSocietyState({ status: "loaded", data: body.society });
      })
      .catch(() => {
        if (!cancelled) setSocietyState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const retrySociety = useCallback(
    (token: string) => {
      setSocietyState({ status: "loading" });
      fetchSociety(token);
    },
    [fetchSociety],
  );

  useEffect(() => {
    if (accountState.status !== "ready") return;
    return fetchSociety(accountState.account.token);
  }, [accountState, fetchSociety]);

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 28,
        padding: "40px 24px 60px",
        maxWidth: 1080,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>ar-agents studio</h1>
        <p style={{ marginTop: 10, color: "var(--text-body)", fontSize: 16 }}>
          Creá una sociedad automatizada conversando.
        </p>
        <p style={{ marginTop: 2, color: "var(--text-muted)", fontSize: 13 }}>
          Chat your way from idea to an operating automated society.
        </p>
      </div>

      <div className="layout-columns">
        <div style={{ flex: 1, minWidth: 0 }}>
          {accountState.status === "loading" ? (
            <div className="card" style={{ fontSize: 14, color: "var(--text-muted)" }}>
              Iniciando sesión...
            </div>
          ) : accountState.status === "error" ? (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 14, margin: 0 }}>
                No pudimos iniciar tu sesión anónima. Puede ser un problema de red.
              </p>
              <button type="button" className="btn btn-primary" onClick={retryAccount}>
                Reintentar
              </button>
            </div>
          ) : (
            <Chat
              token={accountState.account.token}
              hasSociety={societyState.status === "loaded" && societyState.data !== null}
              onStageChange={setStage}
              onSocietyCreated={(society) => setSocietyState({ status: "loaded", data: society })}
            />
          )}
        </div>

        <div style={{ width: 260, flexShrink: 0 }}>
          {accountState.status !== "ready" || societyState.status === "loading" ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Cargando...</p>
          ) : societyState.status === "error" ? (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 13, margin: 0 }}>No pudimos cargar el estado de tu sociedad.</p>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => {
                  if (accountState.status === "ready") retrySociety(accountState.account.token);
                }}
              >
                Reintentar
              </button>
            </div>
          ) : societyState.data ? (
            <OperationDashboard
              token={accountState.account.token}
              initialSociety={societyState.data}
            />
          ) : (
            <JourneyRail stage={stage} />
          )}
        </div>
      </div>
    </main>
  );
}
