import type { Metadata } from "next";
import { DemoTerminal } from "../demo-terminal";

export const metadata: Metadata = {
  title: "Mercado Pago Agent Toolkit · Demo",
  description:
    "Recordable full-screen view of @ar-agents/mercadopago in action.",
  robots: { index: false, follow: false },
};

// Full-screen demo route: just the terminal, centered, no chrome. Built for
// screen-recording (QuickTime cmd+shift+5, Loom, OBS) so the resulting video
// has no header, no theme toggle, no surrounding marketing copy.

export default function DemoPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "32px 24px",
        fontFamily: "var(--font-geist-sans), Arial, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 920 }}>
        <DemoTerminal />
      </div>
    </main>
  );
}
