/**
 * Public homepage (ROADMAP.md M3-3). Minimal branded page, not a developer
 * diagnostic: a fresh deploy shows the society's real identity
 * (`SOCIEDAD_IA_DENOMINACION`, injected by studio's provisioning at
 * `POST /api/society/deploy`, see apps/studio/src/app/api/society/deploy),
 * a one-line description, and a link back to studio, the one cockpit
 * founders operate every society from (ROADMAP.md M3 architectural
 * decision). No client wiring status, no endpoint list, no env
 * diagnostics: that detail moved to the authenticated `GET /api/status`
 * in M3-2, read only by studio's cockpit.
 */

export default function Home() {
  const denominacion = process.env.SOCIEDAD_IA_DENOMINACION?.trim() || "Sociedad automatizada";
  const studioUrl = process.env.STUDIO_URL?.trim() || "https://studio-plum-three-47.vercel.app";

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "24px",
        background: "#000000",
        color: "#f5f5f5",
      }}
    >
      <p
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#888888",
          fontFamily: "ui-monospace, monospace",
          margin: "0 0 20px",
        }}
      >
        sociedad-ia
      </p>
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(28px, 5vw, 44px)",
          fontWeight: 600,
          maxWidth: 640,
        }}
      >
        {denominacion}
      </h1>
      <p
        style={{
          marginTop: 16,
          fontSize: 17,
          lineHeight: 1.5,
          color: "#a1a1a1",
          maxWidth: 480,
        }}
      >
        El agente autónomo de {denominacion}. Operada desde ar-agents studio.
      </p>
      <a
        href={studioUrl}
        style={{
          marginTop: 32,
          padding: "12px 24px",
          borderRadius: 8,
          background: "#f5f5f5",
          color: "#000000",
          fontSize: 15,
          fontWeight: 500,
          textDecoration: "none",
        }}
      >
        Ir a ar-agents studio
      </a>
      <p style={{ marginTop: 48, fontSize: 13, color: "#666666" }}>
        powered by{" "}
        <a href="https://ar-agents.ar" style={{ color: "#888888" }}>
          ar-agents
        </a>
      </p>
    </main>
  );
}
