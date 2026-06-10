"use client";

import { useState } from "react";

/**
 * Client CTA for El Auditor. POSTs to /api/auditor/subscribe; if MP is wired
 * it redirects to the Mercado Pago checkout (init_point), otherwise it shows
 * the early-access confirmation with a link to the provisioned audit session.
 */

type Lang = "es" | "en";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

export function SubscribeCTA({ lang = "es" }: { lang?: Lang }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "err">("idle");
  const [res, setRes] = useState<{ message?: string; dashboardUrl?: string } | null>(null);

  const t = (es: string, en: string) => (lang === "es" ? es : en);

  async function go() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setState("err");
      setRes({ message: t("Ingresá un email válido.", "Enter a valid email.") });
      return;
    }
    setState("loading");
    try {
      const r = await fetch("/api/auditor/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "mensual", payerEmail: email }),
      });
      const j = await r.json();
      if (j?.ok && j.checkout?.initPoint) {
        window.location.href = j.checkout.initPoint as string; // → Mercado Pago
        return;
      }
      if (j?.ok && j.earlyAccess) {
        setState("done");
        setRes({ message: j.message, dashboardUrl: j.audit?.dashboardUrl });
        return;
      }
      setState("err");
      setRes({ message: j?.message || t("Algo falló. Probá de nuevo.", "Something failed. Try again.") });
    } catch {
      setState("err");
      setRes({ message: t("Error de red. Probá de nuevo.", "Network error. Try again.") });
    }
  }

  if (state === "done" && res) {
    return (
      <div style={{ margin: "12px 0 24px", fontSize: 14, color: "var(--text-body)", fontFamily: FONT_SANS }}>
        <p style={{ margin: "0 0 6px" }}>✓ {res.message}</p>
        {res.dashboardUrl ? (
          <a href={res.dashboardUrl} style={{ color: "var(--accent)", textDecoration: "underline" }}>
            {t("Ver tu sesión de auditoría firmada", "View your signed audit session")} →
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "12px 0 24px", fontFamily: FONT_SANS }}>
      <input
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("tu@email.com", "you@email.com")}
        aria-label={t("Email", "Email")}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          background: "var(--bg-tint)",
          color: "var(--text)",
          fontSize: 14,
          minWidth: 220,
          fontFamily: FONT_MONO,
        }}
      />
      <button
        onClick={go}
        disabled={state === "loading"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: 8,
          border: "1px solid var(--accent)",
          background: "var(--accent)",
          color: "var(--bg)",
          fontWeight: 600,
          fontSize: 14,
          cursor: state === "loading" ? "default" : "pointer",
          opacity: state === "loading" ? 0.6 : 1,
        }}
      >
        {state === "loading"
          ? t("Procesando…", "Processing…")
          : t("Activar El Auditor, USD 199/mes", "Activate The Auditor, USD 199/mo")}
      </button>
      {state === "err" && res ? (
        <span style={{ fontSize: 13, color: "var(--warning, #b45309)" }}>{res.message}</span>
      ) : null}
    </div>
  );
}
