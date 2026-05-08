import { PRODUCT_LIST } from "@/lib/catalog";
import { facilitator } from "@/lib/facilitator";

export default async function HomePage() {
  const discovery = facilitator.discoveryPayload();
  const fmt = (minorAmount: number, currency: string) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(minorAmount / 100);

  return (
    <main>
      <header>
        <span className="tag">ACP 2026-04-17 facilitator</span>
        <h1>bridge-hello</h1>
        <p>
          Reference app for{" "}
          <a href="https://www.npmjs.com/package/@ar-agents/agentic-commerce-bridge">
            @ar-agents/agentic-commerce-bridge
          </a>
          . Five demo products, a mock MercadoPago provider, and the full
          Agentic Commerce Protocol surface — ready to point any
          agent-discoverable client (ChatGPT, Claude, Gemini) at.
        </p>
      </header>

      <section>
        <h2>Discovery</h2>
        <p>
          ACP clients hit{" "}
          <code>
            <a href="/.well-known/acp.json">/.well-known/acp.json</a>
          </code>{" "}
          to negotiate version + capabilities (RFC 8615). Live response:
        </p>
        <pre className="good">
          {JSON.stringify(
            {
              protocol: discovery.protocol,
              api_base_url: discovery.api_base_url,
              transports: discovery.transports,
              capabilities: discovery.capabilities,
            },
            null,
            2,
          )}
        </pre>
      </section>

      <section>
        <h2>ACP endpoints</h2>
        <p>
          All five mounted under <code>/api/acp/*</code>:
        </p>
        <ul className="endpoint-list">
          <li>
            <span className="method">POST</span>/api/acp/checkout_sessions
          </li>
          <li>
            <span className="method">POST</span>
            /api/acp/checkout_sessions/{`{id}`}
          </li>
          <li>
            <span className="method">GET</span>
            /api/acp/checkout_sessions/{`{id}`}
          </li>
          <li>
            <span className="method">POST</span>
            /api/acp/checkout_sessions/{`{id}`}/complete
          </li>
          <li>
            <span className="method">POST</span>
            /api/acp/checkout_sessions/{`{id}`}/cancel
          </li>
        </ul>
      </section>

      <section>
        <h2>Catalog</h2>
        <p>
          Five demo products, all priced in ARS. Replace
          <code> demoCatalog</code> in <code>src/lib/catalog.ts</code> with
          <code> createMeliCatalogProvider({"{getItem}"})</code> in production.
        </p>
        <div className="product-grid">
          {PRODUCT_LIST.map((p) => (
            <div key={p.id} className="product">
              <div className="product-id">{p.id}</div>
              <div className="product-name">{p.name}</div>
              <div className="product-price">
                {fmt(p.unit_amount, p.currency)} ·{" "}
                {p.available_quantity ?? "∞"} disponibles
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Try it: create a session</h2>
        <pre>{`curl -X POST http://localhost:3017/api/acp/checkout_sessions \\
  -H "Content-Type: application/json" \\
  -H "API-Version: 2026-04-17" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "currency": "ars",
    "line_items": [
      { "id": "yerba_amanda", "quantity": 1 },
      { "id": "alfajores_havanna", "quantity": 2 }
    ],
    "buyer": { "email": "tere@example.com" }
  }'`}</pre>
      </section>

      <section>
        <h2>Read a session</h2>
        <pre>{`curl http://localhost:3017/api/acp/checkout_sessions/<id> \\
  -H "API-Version: 2026-04-17"`}</pre>
      </section>

      <section>
        <h2>Cancel a session</h2>
        <pre>{`curl -X POST http://localhost:3017/api/acp/checkout_sessions/<id>/cancel \\
  -H "Content-Type: application/json" \\
  -H "API-Version: 2026-04-17" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{ "reason": "buyer changed mind" }'`}</pre>
      </section>

      <section>
        <h2>Complete a session (with mocked MP payment)</h2>
        <p>
          For the demo, use the <code>/api/demo/seed</code> route to seed an
          &quot;approved&quot; MP payment that the bridge will validate
          against. (See README.)
        </p>
        <pre>{`curl -X POST http://localhost:3017/api/acp/checkout_sessions/<id>/complete \\
  -H "Content-Type: application/json" \\
  -H "API-Version: 2026-04-17" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "buyer": { "email": "tere@example.com" },
    "payment_data": {
      "handler_id": "mercadopago",
      "instrument": {
        "type": "card",
        "credential": { "type": "mp_payment_id", "token": "9001" }
      }
    }
  }'`}</pre>
      </section>

      <footer>
        <p>
          Source:{" "}
          <a href="https://github.com/ar-agents/ar-agents/tree/main/apps/bridge-hello">
            github.com/ar-agents/ar-agents/tree/main/apps/bridge-hello
          </a>{" "}
          · Bridge:{" "}
          <a href="https://github.com/ar-agents/ar-agents/tree/main/packages/agentic-commerce-bridge">
            packages/agentic-commerce-bridge
          </a>
        </p>
      </footer>
    </main>
  );
}
