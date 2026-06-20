"use client";

// The administrator's view of the async art. 102 gate: the actions a society's
// agent deferred, awaiting a human. Approve/deny is CUIT-gated (matched against
// the society's signed constitution) and each decision is a signed audit act.
// Renders nothing when there are no pending approvals.

import { useEffect, useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";

type Pending = { id: string; tool: string; argsPreview: string; createdAt: string };

const box: React.CSSProperties = {
  border: "1px solid var(--border-color)",
  borderRadius: 10,
  background: "var(--bg-tint)",
  padding: 14,
};
const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-color)",
  background: "var(--bg)",
  color: "var(--text)",
  font: `13px ${FONT_SANS}`,
};

export function ApprovalsCard({ sessionId }: { sessionId: string }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cuit, setCuit] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/approvals/pending?society=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (active && data?.ok) setPending(data.pending ?? []);
      } catch {
        // leave empty
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);

  async function resolve(id: string, approved: boolean) {
    if (nombre.trim().length < 2 || cuit.trim().length < 8) {
      setErr("Completá tu nombre y CUIT de administrador.");
      return;
    }
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch("/api/approvals/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approved, administrador: { nombre, cuit } }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setErr(
          data?.error === "no_sos_el_administrador"
            ? "Ese CUIT no es el del administrador de esta sociedad."
            : data?.error === "cuit_invalido"
              ? "CUIT inválido."
              : "No se pudo resolver. Reintentá.",
        );
      } else {
        setPending((p) => p.filter((x) => x.id !== id));
      }
    } catch {
      setErr("No se pudo conectar. Reintentá.");
    } finally {
      setBusy(null);
    }
  }

  if (!loaded || pending.length === 0) return null;

  return (
    <article style={{ margin: "24px 0" }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px", color: "var(--text)" }}>
        Aprobaciones pendientes
      </h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
        El agente difirió estas acciones. Como administrador, aprobalas o denegalas (art. 102). Cada
        decisión queda firmada en el audit log.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          style={inputStyle}
          placeholder="Tu nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Tu CUIT"
          value={cuit}
          onChange={(e) => setCuit(e.target.value)}
        />
      </div>
      {err && <div style={{ fontSize: 13, color: "var(--accent)", marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pending.map((p) => (
          <div
            key={p.id}
            style={{
              ...box,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <code style={{ fontFamily: FONT_MONO, fontSize: 13, color: "var(--code-text)" }}>
                {p.tool}
              </code>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 360,
                }}
              >
                {p.argsPreview}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => resolve(p.id, true)}
                disabled={busy === p.id}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: "1px solid var(--accent)",
                  background: "var(--accent)",
                  color: "var(--bg)",
                  font: `600 13px ${FONT_SANS}`,
                  cursor: "pointer",
                }}
              >
                Aprobar
              </button>
              <button
                type="button"
                onClick={() => resolve(p.id, false)}
                disabled={busy === p.id}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: "var(--text-body)",
                  font: `600 13px ${FONT_SANS}`,
                  cursor: "pointer",
                }}
              >
                Denegar
              </button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
