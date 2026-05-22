import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { MermaidDiagram } from "./mermaid-diagram";

const COMPOSITION_FLOW = `sequenceDiagram
    autonumber
    participant U as User
    participant A as Agent (Sonnet 4.6)
    participant ID as identity
    participant BK as banking
    participant ATT as identity-attest
    participant MP as mercadopago
    participant WA as whatsapp
    participant FAC as facturacion
    participant AFIP as AFIP/ARCA
    participant BCRA as BCRA
    participant META as Meta Cloud API
    U->>A: "Cobrale $75k a Acme SRL"
    A->>ID: validate_cuit(30-...)
    ID-->>A: ok
    A->>ID: lookup_cuit_afip(30-...)
    ID->>AFIP: WSAA + ws_sr_constancia
    AFIP-->>ID: Acme SRL, RESP. INSCRIPTO
    ID-->>A: razón social + cat. fiscal
    A->>BK: lookup_credit_situation(30-...)
    BK->>BCRA: Central de Deudores
    BCRA-->>BK: worstSituation 1 (al día)
    BK-->>A: ok
    A->>ATT: request_attestation (>$50k)
    ATT->>WA: send_whatsapp_text (OTP)
    WA->>META: graph send
    META-->>WA: 200
    Note over U,META: Buyer enters OTP, attestation HMAC-signed
    A->>MP: create_subscription
    MP-->>A: init_point_url
    A->>WA: send_whatsapp_text(buyer, init_point_url)
    WA->>META: graph send
    Note over MP,META: Buyer pays · MP webhook → bridge → facturacionHook
    MP->>FAC: crear_factura A
    FAC->>AFIP: WSAA + WSFE solicitarCAE
    AFIP-->>FAC: CAE 75123...12, PDF
    FAC->>WA: send_whatsapp_media(buyer, pdfUrl)
    WA->>META: graph send
`;

const PACKAGE_GRAPH = `flowchart LR
    classDef identity fill:#a855f7,stroke:#7e22ce,color:#fff
    classDef payments fill:#22c55e,stroke:#15803d,color:#fff
    classDef fiscal fill:#eab308,stroke:#a16207,color:#0f172a
    classDef comms fill:#06b6d4,stroke:#0e7490,color:#fff
    classDef logistics fill:#f97316,stroke:#c2410c,color:#fff
    classDef infra fill:#64748b,stroke:#334155,color:#fff,stroke-dasharray:4 3
    classDef external fill:#0f172a,stroke:#475569,color:#cbd5e1,stroke-dasharray:2 2
    AGENT([Vercel AI SDK 6<br/>Experimental_Agent])
    subgraph identity_g[identity]
        ID["@ar-agents/identity<br/>2 tools"]:::identity
        ATT["@ar-agents/identity-attest<br/>5 tools"]:::identity
        MA["@ar-agents/mi-argentina<br/>4 tools"]:::identity
        FD["@ar-agents/firma-digital<br/>4 tools"]:::identity
    end
    subgraph payments_g[payments]
        MP["@ar-agents/mercadopago<br/>89 tools"]:::payments
        ML["@ar-agents/mercadolibre<br/>15 tools"]:::payments
        BK["@ar-agents/banking<br/>11 tools"]:::payments
    end
    subgraph fiscal_g[fiscal]
        FAC["@ar-agents/facturacion<br/>10 tools"]:::fiscal
        IGJ["@ar-agents/igj<br/>6 tools"]:::fiscal
        BO["@ar-agents/boletin-oficial<br/>6 tools"]:::fiscal
        GDE["@ar-agents/gde-tad<br/>4 tools"]:::fiscal
    end
    WA["@ar-agents/whatsapp<br/>6 tools"]:::comms
    SH["@ar-agents/shipping<br/>6 tools"]:::logistics
    BR["@ar-agents/agentic-commerce-bridge"]:::infra
    AP2["@ar-agents/ap2"]:::infra
    MCP["@ar-agents/mcp"]:::infra
    AFIP[(AFIP/ARCA)]:::external
    BCRA[(BCRA)]:::external
    MERC[(Mercado Pago)]:::external
    MELI[(Mercado Libre)]:::external
    META[(Meta Cloud API)]:::external
    CARR[(Andreani / OCA / Correo)]:::external
    AGENT --> ID
    AGENT --> ATT
    AGENT --> MA
    AGENT --> FD
    AGENT --> MP
    AGENT --> ML
    AGENT --> BK
    AGENT --> FAC
    AGENT --> IGJ
    AGENT --> BO
    AGENT --> GDE
    AGENT --> WA
    AGENT --> SH
    BR -. ACP facilitator .-> MP
    BR -. auto-factura .-> FAC
    AP2 -. mandate verify .-> AGENT
    MCP -. bundles all .-> AGENT
    ID --> AFIP
    FAC --> AFIP
    BK --> BCRA
    MP --> MERC
    ML --> MELI
    WA --> META
    ATT --> WA
    SH --> CARR
`;

export const metadata: Metadata = {
  title: "Architecture",
  description:
    "Canonical reference for the @ar-agents/* stack: 17 packages, 168 tools, the Edge-Runtime composition contract, and how an agent loop traverses them.",
  alternates: { canonical: "https://ar-agents.ar/architecture" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type PackageRow = {
  name: string;
  version: string;
  tools: number;
  category: "fiscal" | "payments" | "comms" | "identity" | "infra" | "logistics";
  external: string;
  notes: string;
};

const PACKAGES: PackageRow[] = [
  {
    name: "@ar-agents/identity",
    version: "0.6.0",
    tools: 2,
    category: "identity",
    external: "AFIP/ARCA WSAA + ws_sr_constancia_inscripcion",
    notes: "Algorithm-only validate_cuit always works. lookup_cuit_afip needs WSAA cert.",
  },
  {
    name: "@ar-agents/identity-attest",
    version: "0.4.2",
    tools: 5,
    category: "identity",
    external: "WhatsApp / email / Auth0 / Magic.link / MP Identity",
    notes: "HMAC-signed attestations with trustLevel 0.0–1.0.",
  },
  {
    name: "@ar-agents/mi-argentina",
    version: "0.1.0",
    tools: 4,
    category: "identity",
    external: "Mi Argentina OIDC (gov AR identity)",
    notes: "PKCE + RS256 JWT verify + JWKS caching. Edge-safe.",
  },
  {
    name: "@ar-agents/firma-digital",
    version: "0.1.0",
    tools: 4,
    category: "identity",
    external: "AC-Raíz / ONTI cert authorities",
    notes: "PKCS#7/CMS verify with AR trust-anchor heuristic + fingerprint pinning.",
  },
  {
    name: "@ar-agents/gde-tad",
    version: "0.1.0",
    tools: 4,
    category: "fiscal",
    external: "TAD / GDE / Domicilio Electrónico",
    notes:
      "DEC inbox polling + Mis Trámites + IGJ pre-flight validator. The 4th pieza for sociedades-IA, RFC-001 § 3.4.",
  },
  {
    name: "@ar-agents/mercadopago",
    version: "0.17.2",
    tools: 89,
    category: "payments",
    external: "api.mercadopago.com",
    notes: "Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Cuotas, QR, 3DS, Point.",
  },
  {
    name: "@ar-agents/mercadolibre",
    version: "0.1.0",
    tools: 15,
    category: "payments",
    external: "api.mercadolibre.com",
    notes: "First faithful TS SDK since the official one was archived in 2022. Items + catalog + questions/messages + claims + shipments + reputation + promotions + webhooks with /missed_feeds replay.",
  },
  {
    name: "@ar-agents/banking",
    version: "0.2.0",
    tools: 11,
    category: "payments",
    external: "BCRA Central de Deudores + BCRA Principales Variables",
    notes: "CBU/CVU validators (algorithm), USD oficial / CER / UVA / reservas / inflación.",
  },
  {
    name: "@ar-agents/facturacion",
    version: "0.1.2",
    tools: 10,
    category: "fiscal",
    external: "AFIP/ARCA WSFE",
    notes: "Factura A/B/C, NC/ND, FCE MiPyMEs. Pre-flight validator.",
  },
  {
    name: "@ar-agents/igj",
    version: "0.1.0",
    tools: 6,
    category: "fiscal",
    external: "datos.jus.gob.ar (open data)",
    notes: "Inspección General de Justicia, corporate registry lookups.",
  },
  {
    name: "@ar-agents/boletin-oficial",
    version: "0.1.0",
    tools: 6,
    category: "fiscal",
    external: "boletinoficial.gob.ar",
    notes: "Search + subscribe by CUIT / organismo / keyword.",
  },
  {
    name: "@ar-agents/whatsapp",
    version: "0.4.0",
    tools: 6,
    category: "comms",
    external: "Meta WhatsApp Business Cloud API",
    notes: "Webhook + HMAC verify. AR phone normalizer. scopedTo mode.",
  },
  {
    name: "@ar-agents/shipping",
    version: "0.1.1",
    tools: 6,
    category: "logistics",
    external: "Andreani / OCA / Correo Argentino",
    notes: "Multi-carrier compare. Provincia + CPA helpers.",
  },
  {
    name: "@ar-agents/agentic-commerce-bridge",
    version: "3.0.0",
    tools: 0,
    category: "infra",
    external: "ACP spec + Mercado Pago + facturación",
    notes: "ACP facilitator. Auto-issues Factura A/B/C/E on payment. /.well-known/acp.json discovery.",
  },
  {
    name: "@ar-agents/ap2",
    version: "0.2.0",
    tools: 0,
    category: "infra",
    external: "Google AP2 spec",
    notes: "Mandate verification + signing. ES256, JWS canonical claims.",
  },
  {
    name: "@ar-agents/mcp",
    version: "0.6.2",
    tools: 0,
    category: "infra",
    external: "MCP host (Claude Desktop / Cursor / Continue / Cline)",
    notes: "Bundles all 7 tool packages over Model Context Protocol.",
  },
  {
    name: "@ar-agents/incorporate",
    version: "0.1.0",
    tools: 0,
    category: "fiscal",
    external: "AFIP/ARCA + IGJ + RENAPER + Mi Argentina",
    notes:
      "Incorporation flow orchestrator: composes identity, mi-argentina, igj, gde-tad and facturacion into a single end-to-end sociedad-IA incorporation pipeline.",
  },
];

const CATEGORY_LABEL: Record<PackageRow["category"], string> = {
  identity: "Identity",
  payments: "Payments + banking",
  fiscal: "Fiscal + corporate",
  comms: "Communications",
  logistics: "Logistics",
  infra: "Infrastructure / bridges",
};

const CATEGORY_COLOR: Record<PackageRow["category"], string> = {
  identity: "#a855f7",
  payments: "#22c55e",
  fiscal: "#eab308",
  comms: "#06b6d4",
  logistics: "#f97316",
  infra: "#64748b",
};

const TOTAL_TOOLS = PACKAGES.reduce((acc, p) => acc + p.tools, 0);
const PUBLISHED_PACKAGES = PACKAGES.length;

export default function ArchitecturePage() {
  return (
    <DocShell
      eyebrow="architecture · 2026-05"
      title="Architecture."
      subtitle={`${PUBLISHED_PACKAGES} packages, ${TOTAL_TOOLS} tools, one Edge-Runtime composition contract.`}
    >
      <DocBlock>
        <DocP>
          The toolkit is not a monolith. Each package solves one external
          dependency (AFIP, BCRA, MP, Meta, Andreani, etc.) and ships
          independently to npm. They compose at the agent-loop level,
          there are no cross-package runtime dependencies beyond optional
          adapter subpaths.
        </DocP>
        <DocP>
          That matters because an Argentine business-as-agent isn&apos;t one
          thing, it&apos;s the simultaneous operation of 5–7 external systems
          (taxpayer registry, payment processor, banking, invoicing, government
          identity, shipping carrier, public records). The toolkit is shaped
          around that fact.
        </DocP>
      </DocBlock>

      <DocH2>The 17 packages</DocH2>

      <MermaidDiagram
        chart={PACKAGE_GRAPH}
        caption="The agent talks to packages; packages talk to external systems. Bridges (dashed) compose the others."
      />

      <div
        style={{
          display: "grid",
          gap: 8,
          fontSize: 14,
          marginBottom: 32,
        }}
      >
        {(["identity", "payments", "fiscal", "comms", "logistics", "infra"] as const).map(
          (cat) => (
            <div key={cat}>
              <h3
                style={{
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: CATEGORY_COLOR[cat],
                  fontFamily: FONT_MONO,
                  fontWeight: 600,
                  margin: "16px 0 6px",
                }}
              >
                {CATEGORY_LABEL[cat]}
              </h3>
              <div style={{ display: "grid", gap: 4 }}>
                {PACKAGES.filter((p) => p.category === cat).map((p) => (
                  <article
                    key={p.name}
                    style={{
                      background: "var(--bg)",
                      borderRadius: 6,
                      padding: "10px 14px",
                      boxShadow: "var(--card-shadow)",
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 280px) 70px 1fr",
                      gap: 16,
                      alignItems: "baseline",
                    }}
                  >
                    <div>
                      <code
                        style={{
                          fontFamily: FONT_MONO,
                          color: "var(--text)",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {p.name}
                      </code>
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: "var(--text-muted)",
                          fontFamily: FONT_MONO,
                        }}
                      >
                        v{p.version}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 12,
                        color: "var(--text-muted)",
                      }}
                    >
                      {p.tools > 0 ? `${p.tools} tools` : "infra"}
                    </div>
                    <div style={{ color: "var(--text-body)", fontSize: 13, lineHeight: 1.5 }}>
                      {p.notes}{" "}
                      <span style={{ color: "var(--text-muted)" }}>· {p.external}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      <DocH2>Composition flow</DocH2>
      <DocP>
        How a single <DocCode>agent.generate()</DocCode> call traverses the
        stack when an Argentine SaaS bills a B2B customer. Sequence diagram
        below, each arrow is a real tool invocation or HTTP round-trip.
        The audit log records every step with HMAC-signed timestamps; what
        the diagram hides is that all of those arrows return through{" "}
        <DocCode>AuditLogger.wrap()</DocCode> on the way back.
      </DocP>

      <MermaidDiagram
        chart={COMPOSITION_FLOW}
        caption="One prompt → 8 tool calls across 6 packages → CAE issued, PDF delivered. Compose without coupling."
      />

      <DocH2>The Edge-Runtime contract</DocH2>
      <DocP>
        Every package in this list runs on Edge Runtime (Vercel Edge,
        Cloudflare Workers, Deno) without code changes. The contract:
      </DocP>
      <DocP>
        <strong>1. Web Crypto only</strong>. No <DocCode>node:crypto</DocCode>{" "}
        in any production code path. HMAC, signature verification,
        idempotency-key generation all use{" "}
        <DocCode>crypto.subtle</DocCode>.
      </DocP>
      <DocP>
        <strong>2. fetch-based HTTP</strong>. No <DocCode>got</DocCode>,{" "}
        <DocCode>axios</DocCode>, or <DocCode>node:http</DocCode>. The
        toolkit ships its own retry + circuit-breaker + deadline-propagation
        layer on top of the runtime&apos;s native <DocCode>fetch</DocCode>.
      </DocP>
      <DocP>
        <strong>3. AbortSignal everywhere</strong>. Every long-running tool
        accepts a parent <DocCode>AbortSignal</DocCode> and propagates
        cancellation. The runtime kills hung tool calls cleanly when the
        request times out.
      </DocP>
      <DocP>
        <strong>4. Pluggable state via subpath</strong>.{" "}
        <DocCode>InMemoryStateAdapter</DocCode> for tests +{" "}
        <DocCode>VercelKVStateAdapter</DocCode> for prod. Same interface;
        users pick where state lives.
      </DocP>

      <DocH2>Composition example: 5-package agent</DocH2>
      <DocP>
        The cookbook ships{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/blob/main/packages/mercadopago/cookbook/10-cross-package-billing.ts"
          style={{ color: "var(--accent)" }}
        >
          recipe 10
        </a>:{" "}
      one agent loop wiring identity + identity-attest + mercadopago +
        facturacion + whatsapp. The flagship demo of the composition contract.
      </DocP>
      <DocP>
        Full cookbook (17 production patterns):{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadopago/cookbook"
          style={{ color: "var(--accent)" }}
        >
          packages/mercadopago/cookbook
        </a>
        .
      </DocP>

      <DocH2>Trust, audit, governance</DocH2>
      <DocP>
        <strong>npm provenance attestations (SLSA v1)</strong>: every
        published tarball is cryptographically tied to the GitHub commit
        it was built from. <DocCode>npm view @ar-agents/mercadopago dist.attestations</DocCode>{" "}
        returns the Sigstore transparency-log entry.
      </DocP>
      <DocP>
        <strong>OpenSSF Scorecard</strong>: weekly automated audit of 18
        supply-chain practices. Score visible at{" "}
        <a
          href="https://scorecard.dev/viewer/?uri=github.com/ar-agents/ar-agents"
          style={{ color: "var(--accent)" }}
        >
          scorecard.dev
        </a>
        .
      </DocP>
      <DocP>
        <strong>Programmatic HITL on irreversible ops</strong>: refunds,
        cancellations, deletions, marketplace token revokes, all 8
        gated behind a <DocCode>requireConfirmation</DocCode> callback
        the host implements. Tool functions literally don&apos;t execute
        until your callback returns <DocCode>true</DocCode>.
      </DocP>
      <DocP>
        <strong>Audit log adapter</strong>: every tool call (input + output
        + duration + status) gets logged to a pluggable sink (in-memory,
        Vercel KV, your own). HMAC timestamps make the log forensically
        sound, see{" "}
        <a
          href="/rfcs/001"
          style={{ color: "var(--accent)" }}
        >
          RFC-001 § 9
        </a>{" "}
        for the liability framework.
      </DocP>
    </DocShell>
  );
}
