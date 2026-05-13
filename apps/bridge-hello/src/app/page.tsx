import { PRODUCT_LIST, meliCatalogStatus } from "@/lib/catalog";
import { facilitator } from "@/lib/facilitator";
import { AP2Verifier } from "./components/AP2Verifier";

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
        <h2>Agent-readable product feed</h2>
        <p>
          Buyer agents (ChatGPT, Claude, Gemini) discover this storefront&rsquo;s
          catalog via{" "}
          <code>
            <a href="/.well-known/agentic-feed.json">
              /.well-known/agentic-feed.json
            </a>
          </code>{" "}
          and paginate through{" "}
          <code>
            <a href="/api/feed/products">/api/feed/products</a>
          </code>
          . The feed is ACP <code>2026-04-17</code>-compatible, ETag-cached,
          and powered by{" "}
          <a href="https://www.npmjs.com/package/@ar-agents/mercadolibre">
            @ar-agents/mercadolibre/feed
          </a>
          . When <code>MELI_ACCESS_TOKEN</code> + <code>MELI_SELLER_ID</code>{" "}
          are configured, it streams the seller&rsquo;s live MELI catalog;
          otherwise it serves a synthesized demo feed of the products above.
        </p>
        <ul className="endpoint-list">
          <li>
            <span className="method">GET</span>
            /.well-known/agentic-feed.json
          </li>
          <li>
            <span className="method">GET</span>
            /api/feed/products?cursor=&amp;limit=
          </li>
        </ul>
      </section>

      <section>
        <h2>Catalog</h2>
        <p>
          {meliCatalogStatus.connected ? (
            <>
              <span className="tag tag-live">MELI live</span> Catalog is wired
              against the live MELI REST API via{" "}
              <a href="https://www.npmjs.com/package/@ar-agents/mercadolibre">
                @ar-agents/mercadolibre
              </a>
              . Item ids that start with <code>MLA…</code> resolve in real
              time; the demo ids below are still served from the local mock so
              the storefront stays explorable.
            </>
          ) : (
            <>
              <span className="tag tag-demo">Demo mode</span> Five mock products
              priced in ARS. Set <code>MELI_ACCESS_TOKEN</code> in your env
              and the catalog auto-switches to live MELI lookups via{" "}
              <a href="https://www.npmjs.com/package/@ar-agents/mercadolibre">
                @ar-agents/mercadolibre
              </a>{" "}
              — one of the round-out toolbox packages shipped alongside the
              bridge.
            </>
          )}
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

      <section className="meli-section">
        <span className="tag tag-secondary">Mercado Libre Agent Toolkit</span>
        <h2>@ar-agents/mercadolibre — the SDK MELI stopped shipping</h2>
        <p>
          The official <code>mercadolibre/nodejs-sdk</code> was archived in
          February 2022.{" "}
          <a href="https://www.npmjs.com/package/@ar-agents/mercadolibre">
            @ar-agents/mercadolibre
          </a>{" "}
          is the typed, AI-SDK-native replacement: 14 agent tools, 75 tests,
          OAuth single-use refresh-token coalescing, <code>/myfeeds</code>{" "}
          two-day replay, claim-defense pattern, reputation thermometer, and a
          margin-guarded promo opt-in helper.
        </p>
        <ul className="endpoint-list">
          <li>
            <span className="method">items</span>get / multi-get / create /
            update / pause / close / relist / search / scroll-iterate
          </li>
          <li>
            <span className="method">categories</span>predict + technical-spec
            planning in one call
          </li>
          <li>
            <span className="method">questions</span>list / answer / blacklist
            + heuristic spam classifier
          </li>
          <li>
            <span className="method">orders</span>search / get / billing-info /
            packs (cart vs single)
          </li>
          <li>
            <span className="method">claims</span>search / evidences /
            messages + the 2-day SLA <code>defendClaim</code> helper
          </li>
          <li>
            <span className="method">shipments</span>history + label blob (ZPL
            / PDF) + shipping options
          </li>
          <li>
            <span className="method">reputation</span>thermometer alerts +
            async-iterator monitor
          </li>
          <li>
            <span className="method">promotions</span>candidates + auto-opt-in
            with margin floor
          </li>
          <li>
            <span className="method">webhooks</span>parse + 2-day{" "}
            <code>/myfeeds</code> replay
          </li>
          <li>
            <span className="method">/ai-sdk</span>14 Vercel AI SDK 6 tools
            ready for <code>Experimental_Agent</code>
          </li>
          <li>
            <span className="method">/testing</span>
            <code>mockFetch()</code> builder + <code>makeMeliClient()</code>{" "}
            factory
          </li>
        </ul>
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

      <section className="ap2-section">
        <span className="tag tag-secondary">AP2 v0.2 mandate verifier</span>
        <h2>Live AP2 mandate playground</h2>
        <p>
          Powered by{" "}
          <a href="https://www.npmjs.com/package/@ar-agents/ap2">
            @ar-agents/ap2
          </a>
          {" — "}
          first faithful TypeScript implementation of the FIDO Alliance Agent
          Payments Protocol v0.2 (single-hop + multi-hop dSD-JWT chains).
          Click <strong>Issue a demo mandate</strong> to mint a fresh
          ES256-signed Closed Checkout Mandate, then <strong>Verify</strong>{" "}
          to walk the full canonical verification trail (parse → resolve
          disclosures → compute sd_hash → verify signatures → confirm
          checkout_hash).
        </p>
        <AP2Verifier />
        <details className="ap2-details">
          <summary>What does &quot;verify&quot; check?</summary>
          <ol>
            <li>SD-JWT VC compact serialization parses cleanly (RFC 9901).</li>
            <li>Issuer JWS signature (ES256, P-256) matches the agent&apos;s public JWK.</li>
            <li>Selective disclosures resolve to the issuer payload; <code>_sd</code> digests match.</li>
            <li><code>sd_hash</code> = base64url(sha-256(presentation up to last <code>~</code>)).</li>
            <li>For Closed Checkout Mandates: <code>checkout_hash</code> = base64url(sha-256(<code>checkout_jwt</code>)).</li>
            <li>Inner <code>checkout_jwt</code> signature matches the merchant&apos;s public JWK and is signed with a non-deterministic algorithm (ECDSA family) — Ed25519 is forbidden per spec to defeat rainbow-table attacks.</li>
            <li>For multi-hop chains: each hop&apos;s signature verifies under the previous hop&apos;s <code>cnf.jwk</code>; <code>aud</code> + <code>nonce</code> bound to terminal hop only.</li>
          </ol>
        </details>
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
