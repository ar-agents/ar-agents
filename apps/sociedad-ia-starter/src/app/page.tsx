import { clientStatus } from "@/lib/clients";

export default function Home() {
  const status = clientStatus();
  const denominacion = process.env.SOCIEDAD_IA_DENOMINACION ?? "ACME-AI SAS";
  const wired = Object.values(status).filter((s) => s === "wired").length;
  const total = Object.keys(status).length;
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "60px 24px",
        lineHeight: 1.55,
      }}
    >
      <p
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
          fontFamily: "ui-monospace, monospace",
          margin: 0,
        }}
      >
        sociedad-ia · starter · v0.1
      </p>
      <h1 style={{ marginTop: 8, fontSize: 32, fontWeight: 600 }}>
        {denominacion}
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: 16 }}>
        Operated by an LLM agent on top of <code>@ar-agents/*</code>.
        Configurada en este deploy: <strong>{wired}/{total}</strong>{" "}
        clientes externos (ARCA padron, AFIP WSFE, Mercado Pago, WhatsApp).
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Estado de clientes</h2>
      <ul style={{ paddingLeft: 20 }}>
        {Object.entries(status).map(([name, state]) => (
          <li key={name} style={{ marginBottom: 6 }}>
            <code style={{ fontFamily: "ui-monospace, monospace" }}>{name}</code>
            {" — "}
            <span
              style={{
                color: state === "wired" ? "#22c55e" : "var(--text-muted)",
                fontFamily: "ui-monospace, monospace",
                fontSize: 13,
              }}
            >
              {state}
            </span>
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Endpoints</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li>
          <code>POST /api/agent</code> — agent loop. Body:{" "}
          <code>{`{ "prompt": "..." }`}</code>
        </li>
        <li>
          <code>POST /api/webhooks/mercadopago</code> — MP webhook receiver.
          Verifies HMAC signature.
        </li>
        <li>
          <code>GET /api/cron/morning</code> — daily operating loop. Wire
          to Vercel Cron.
        </li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Próximos pasos</h2>
      <ol style={{ paddingLeft: 20 }}>
        <li>
          Copiá <code>.env.example</code> a <code>.env.local</code> y
          completá los valores reales.
        </li>
        <li>
          <code>pnpm install &amp;&amp; pnpm dev</code> — corre en{" "}
          <code>localhost:3020</code>.
        </li>
        <li>
          Deploy a Vercel:{" "}
          <a href="https://vercel.com/new" target="_blank" rel="noreferrer">
            vercel.com/new
          </a>
          .
        </li>
        <li>
          Pegá los env vars de <code>.env.example</code> en Settings →
          Environment Variables.
        </li>
      </ol>

      <p style={{ marginTop: 32, fontSize: 14, color: "var(--text-muted)" }}>
        Documentación completa:{" "}
        <a href="https://ar-agents.ar/playbook">/playbook</a> · RFC:{" "}
        <a href="https://ar-agents.ar/rfcs/001">/rfcs/001</a> · Threat
        model: <a href="https://ar-agents.ar/security">/security</a>.
      </p>
    </main>
  );
}
