export default function Home() {
  return (
    <main
      style={{
        padding: "48px 24px",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        maxWidth: "720px",
        margin: "0 auto",
        lineHeight: 1.6,
        color: "#0a0a0a",
      }}
    >
      <header style={{ marginBottom: "32px" }}>
        <p
          style={{
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#71717a",
            margin: 0,
          }}
        >
          ar-agents · fase 1
        </p>
        <h1 style={{ fontSize: "32px", margin: "8px 0 0", fontWeight: 600 }}>
          Hello MP Agent
        </h1>
        <p style={{ color: "#52525b", margin: "8px 0 0" }}>
          Vercel AI SDK 6 + Mercado Pago Subscriptions, end-to-end.
        </p>
      </header>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Endpoints</h2>
        <ul style={{ paddingLeft: "20px" }}>
          <li>
            <strong>POST</strong> <code>/api/agent</code> — conversar con el
            agente
          </li>
          <li>
            <strong>POST</strong> <code>/api/webhook/mercadopago</code> —
            recibir eventos MP
          </li>
          <li>
            <strong>GET</strong> <code>/api/agent</code> — info de uso
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600 }}>
          Probar el agente vía curl
        </h2>
        <pre
          style={{
            background: "#fafafa",
            border: "1px solid #e4e4e7",
            padding: "16px",
            borderRadius: "8px",
            overflow: "auto",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >{`curl -X POST http://localhost:3000/api/agent \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Cre\xE1 una subscription mensual de $100 ARS para test_user@test.com, motivo: Plan b\xE1sico"}'`}</pre>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Flujo esperado</h2>
        <ol style={{ paddingLeft: "20px" }}>
          <li>
            Agente crea subscription, devuelve <code>init_point_url</code>.
          </li>
          <li>
            Cliente test abre el URL y completa primer pago en MP Sandbox con
            tarjeta+CVV.
          </li>
          <li>
            MP dispara webhook → state actualizado en Upstash con{" "}
            <code>status: authorized</code>.
          </li>
          <li>
            Preguntale al agente <em>“qué status tiene la sub X?”</em> y debería
            confirmarte que está activa.
          </li>
          <li>MP cobra recurring automático según frecuencia configurada.</li>
        </ol>
      </section>

      <footer
        style={{
          marginTop: "48px",
          paddingTop: "24px",
          borderTop: "1px solid #e4e4e7",
          fontSize: "13px",
          color: "#71717a",
        }}
      >
        Setup completo en <code>README.md</code>.
      </footer>
    </main>
  );
}
