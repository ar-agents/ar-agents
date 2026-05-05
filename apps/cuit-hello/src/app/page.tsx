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
          ar-agents · fase 3
        </p>
        <h1 style={{ fontSize: "32px", margin: "8px 0 0", fontWeight: 600 }}>
          Hello CUIT Validator
        </h1>
        <p style={{ color: "#52525b", margin: "8px 0 0" }}>
          Vercel AI SDK 6 + algoritmo modulo-11. AFIP webservice scaffolded para v0.2.
        </p>
      </header>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Endpoints</h2>
        <ul style={{ paddingLeft: "20px" }}>
          <li>
            <strong>POST</strong> <code>/api/agent</code> — conversar con el agente IA
          </li>
          <li>
            <strong>GET</strong> <code>/api/cuit?value=20-41758101-5</code> — validación pura sin LLM
          </li>
          <li>
            <strong>POST</strong> <code>/api/cuit</code> — validación batch (body: <code>{`{values:[...]}`}</code>)
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Probar el agente vía curl</h2>
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
        >{`curl -X POST http://localhost:3014/api/agent \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Validá el CUIT 20-41758101-5 y dec\xEDme qu\xE9 sab\xE9s de \xE9l."}'`}</pre>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Validación directa (sin LLM)</h2>
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
        >{`curl http://localhost:3014/api/cuit?value=20-41758101-5

# Batch
curl -X POST http://localhost:3014/api/cuit \\
  -H "Content-Type: application/json" \\
  -d '{"values":["20-41758101-5","30707500126","27ABCD"]}'`}</pre>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Estado v0.1 vs v0.2</h2>
        <ul style={{ paddingLeft: "20px" }}>
          <li>
            ✅ <strong>v0.1 (this build):</strong> validación algorítmica completa
            (formato, prefix, dígito verificador modulo 11, tipo de persona).
          </li>
          <li>
            ⏳ <strong>v0.2:</strong> consulta padrón AFIP (nombre, condición tributaria,
            categoría de monotributo). Requiere setup de cert X.509 — ver
            <code> src/lib/afip-stub.ts</code> para los pasos.
          </li>
        </ul>
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
