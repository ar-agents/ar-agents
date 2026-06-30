import type { Metadata } from "next";
import { MockPspClient } from "./mock-psp-client";

/**
 * /mock-psp — a small neutral demo of a COUNTERPARTY (a mock payment-service
 * provider) checking an entity's good standing before transacting. It calls the
 * public good-standing oracle and shows the accept/reject decision plus the exact
 * oracle answer it was based on. Public copy stays neutral and matter-of-fact.
 */

export const metadata: Metadata = {
  title: "Mock PSP · check good standing before transacting",
  description:
    "A small demo counterparty: paste an entity URL, id, or CUIT and see how a payment-service provider would accept or reject it based on the public good-standing oracle answer.",
  alternates: { canonical: "https://ar-agents.ar/mock-psp" },
};

const FONT_SANS =
  "var(--font-geist-sans), Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol";

export default function MockPspPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: FONT_SANS,
        padding: "clamp(24px, 6vw, 64px) 20px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 13,
            color: "var(--text-muted)",
            margin: "0 0 12px",
          }}
        >
          demo · counterparty
        </p>
        <h1 style={{ fontSize: "clamp(24px, 4vw, 34px)", lineHeight: 1.15, margin: "0 0 14px" }}>
          Check good standing before transacting
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: "var(--text-body)",
            margin: "0 0 8px",
            maxWidth: 620,
          }}
        >
          This is a demo of how a counterparty (for example a payment-service
          provider) decides whether to onboard an automated company. It does not
          judge the entity itself. It asks the public good-standing oracle and
          accepts or rejects based on the signed answer.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-muted)", margin: "0 0 28px" }}>
          Paste an entity URL, registry id, or CUIT. The decision and the oracle
          answer it was based on are shown below.
        </p>

        <MockPspClient />
      </div>
    </main>
  );
}
