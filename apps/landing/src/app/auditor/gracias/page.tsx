import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivateClient } from "./activate-client";

/**
 * /auditor/gracias, Mercado Pago back_url for El Auditor subscriptions.
 * Exchanges the ?preapproval_id= for an API key (POST /api/auditor/activate)
 * and shows the 60-second quickstart. noindex: it's a transactional page.
 */

export const metadata: Metadata = {
  title: "El Auditor, suscripción activada · ar-agents",
  description:
    "Activación de El Auditor: canjeá tu suscripción autorizada de Mercado Pago por una API key y escribí tu primer registro firmado.",
  robots: { index: false, follow: false },
};

export default function GraciasPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "64px 20px 96px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-faint, var(--text-body))",
          margin: "0 0 10px",
        }}
      >
        El Auditor · activación
      </p>
      <h1
        style={{
          fontFamily: "var(--font-geist-sans), Arial, sans-serif",
          fontSize: 28,
          lineHeight: 1.25,
          margin: "0 0 18px",
          color: "var(--text)",
        }}
      >
        Gracias. Cerremos el loop.
      </h1>
      <Suspense
        fallback={
          <p style={{ fontFamily: "var(--font-geist-sans), Arial, sans-serif", fontSize: 15 }}>
            Cargando…
          </p>
        }
      >
        <ActivateClient />
      </Suspense>
    </main>
  );
}
