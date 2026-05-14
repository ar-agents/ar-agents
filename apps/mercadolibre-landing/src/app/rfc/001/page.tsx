import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "RFC 001 — Argentine Agentic Commerce 2027",
  description:
    "How LATAM marketplaces can participate in agentic commerce without ceding the marketplace-buyer relationship to OpenAI, Anthropic, or Stripe.",
};

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

export default function RFC001Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: FONT_SANS,
        color: "var(--text)",
        padding: "80px 24px 120px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            textDecoration: "underline",
            textUnderlineOffset: 4,
          }}
        >
          ← back to landing
        </Link>

        <header style={{ margin: "32px 0 8px" }}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              marginBottom: 12,
            }}
          >
            rfc 001 · draft for public comment · 2026-05-09
          </div>
          <h1
            style={{
              fontSize: "clamp(32px, 6vw, 42px)",
              margin: 0,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: "-0.04em",
            }}
          >
            Argentine Agentic Commerce 2027
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: "var(--text-body)",
              margin: "16px 0 0",
            }}
          >
            How LATAM marketplaces can participate in agentic commerce without
            ceding the marketplace-buyer relationship to OpenAI, Anthropic, or
            Stripe.
          </p>
        </header>

        <Section h="Summary">
          <P>
            By Q4 2027, between 13% and 20% of LATAM retail intent (Forrester /
            Flywheel projections) will route through agent intermediaries —
            ChatGPT Instant Checkout, Claude shopping flows, Gemini's product
            graph. The marketplaces that emit a controlled, opt-in agent feed
            and integrate with the Agentic Commerce Protocol (ACP) will retain
            the relationship; the ones that don't will be disintermediated as
            scrape targets.
          </P>
          <P>
            This RFC proposes a concrete architecture for Argentine
            marketplaces — primarily Mercado Libre, secondarily Tiendanube +
            Falabella + Magalu — to participate in agentic commerce{" "}
            <em>without</em> ceding the marketplace-buyer relationship to
            third parties.
          </P>
        </Section>

        <Section h="Why now">
          <H3>1. Buyer-side agent shipping is real, not hypothetical.</H3>
          <Bullet>
            <Ext href="https://openai.com/index/buy-it-in-chatgpt/">
              OpenAI Instant Checkout
            </Ext>{" "}
            shipped September 2025 with Etsy + Shopify on ACP{" "}
            <code>2026-04-17</code>.
          </Bullet>
          <Bullet>
            Anthropic has shipped MCP-driven shopping demos through partner
            builds (June 2025).
          </Bullet>
          <Bullet>
            Google's Gemini is indexing product feeds against{" "}
            <code>Schema.org/Product</code> for buyer-intent queries.
          </Bullet>

          <H3>2. Mercado Libre's CEO has publicly committed to agentic commerce.</H3>
          <Quote>
            "We are developing our own agentic experience inside MercadoLibre
            … agentic commerce could mean that retail will move even faster
            from offline to online."
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 6,
                fontFamily: FONT_MONO,
              }}
            >
              — Ariel Szarfsztejn, CEO Mercado Libre, Q4 2025 earnings call
              (Feb 26 2026)
            </div>
          </Quote>
          <P>
            But MELI's public agent surface, as of May 2026, exposes only one
            MCP tool: <code>search_documentation</code>. The seller-side agent
            tools needed to compete with Tiendanube's Lumi and Mercado Pago's
            Claude Code marketplace are not shipped.
          </P>

          <H3>3. Tiendanube launched Lumi at InovA 2026.</H3>
          <P>
            Direct LATAM marketplace competitor with an AI assistant for
            sellers and a WhatsApp checkout (NuvemChat). Tiendanube reported
            R$65 billion in sales and is moving aggressively into the
            AI-friendly platform positioning.
          </P>
          <P>
            The empty space between "MELI sellers asking ChatGPT to write
            their listings" and "MELI ratifying that workflow" is competitive
            territory Tiendanube is happy to occupy.
          </P>
        </Section>

        <Section h="Architecture — three layers">
          <H3>Layer 1 — Discovery (the agent-side defense)</H3>
          <P>
            A controlled ACP feed at <code>/.well-known/agentic-feed.json</code>{" "}
            that advertises the marketplace's preference for routing buyers
            through native checkout, defaults to opt-in, and returns paginated{" "}
            <code>FeedProduct</code> entries with deep-links so even
            unaffiliated agents prefer routing through MELI.
          </P>
          <P>
            <strong>Reference impl:</strong>{" "}
            <Ext href="https://www.npmjs.com/package/@ar-agents/mercadolibre">
              @ar-agents/mercadolibre/feed
            </Ext>
            . Live at{" "}
            <Ext href="https://bridge-hello.ar-agents.ar/.well-known/agentic-feed.json">
              bridge-hello.ar-agents.ar
            </Ext>
            .
          </P>

          <H3>Layer 2 — Transaction (the routing-back surface)</H3>
          <P>
            An ACP facilitator at <code>/api/acp/checkout_sessions</code> that
            accepts buyer-agent checkout requests per ACP{" "}
            <code>2026-04-17</code>, resolves the cart against the
            marketplace's actual inventory + price + shipping data, and runs
            the actual capture <strong>inside MELI's checkout</strong>, not
            via third-party Stripe.
          </P>
          <P>
            This is the architectural difference between MELI participating in
            agentic commerce vs being scraped.
          </P>
          <P>
            <strong>Reference impl:</strong>{" "}
            <Ext href="https://github.com/ar-agents/ar-agents/tree/main/packages/agentic-commerce-bridge">
              @ar-agents/agentic-commerce-bridge
            </Ext>
            .
          </P>

          <H3>Layer 3 — Seller-side agent</H3>
          <P>
            An expanded MCP server / AI SDK toolkit covering the
            seller-relevant API surface — items, categories, questions,
            orders, claims, shipments, reputation, promotions, webhooks. With
            HITL gates on irreversible operations.
          </P>
          <P>
            <strong>Reference impl:</strong> this package. 14 tools shipped,
            142 tests, MIT-licensed, ready to extend MELI's existing{" "}
            <Ext href="https://github.com/mercadolibre/mercadolibre-mcp-server">
              mercadolibre/mercadolibre-mcp-server
            </Ext>
            .
          </P>
        </Section>

        <Section h="Open questions for the comment period">
          <Numbered>
            <li>
              <strong>Marketplace-side authentication.</strong> Should there
              be a marketplace-issued buyer-agent token for higher-trust
              flows?
            </li>
            <li>
              <strong>Argentine consumer law (24.240).</strong> Who is the
              legal buyer of record — the agent, the user, or the agent
              operator?
            </li>
            <li>
              <strong>Mercado Pago integration.</strong> ACP{" "}
              <code>2026-04-17</code> assumes Stripe-style{" "}
              <code>payment_intents</code>. A LATAM-localized profile may be
              needed.
            </li>
            <li>
              <strong>Sandbox infrastructure.</strong> None of the LATAM
              marketplaces today provide an agent-friendly sandbox. This
              architecture would benefit from a public sandbox mode.
            </li>
            <li>
              <strong>Trademark + co-branding.</strong> What's the pattern
              when a community-built impl gets ratified? See{" "}
              <Ext href="https://docs.stripe.com/sdks/community">
                Stripe's Community SDKs
              </Ext>
              .
            </li>
          </Numbered>
        </Section>

        <Section h="Comment + collaborate">
          <Bullet>
            GitHub Discussions:{" "}
            <Ext href="https://github.com/ar-agents/ar-agents/discussions">
              ar-agents/ar-agents/discussions
            </Ext>
          </Bullet>
          <Bullet>
            Direct: <code>naza@helloastro.co</code> subject{" "}
            <code>[rfc-001]</code>
          </Bullet>
          <Bullet>
            Strategic argument:{" "}
            <Ext href="https://github.com/ar-agents/ar-agents/blob/main/packages/mercadolibre/POSITIONING.md">
              POSITIONING.md
            </Ext>
          </Bullet>
          <Bullet>
            Adoption paths:{" "}
            <Link
              href="/integrate"
              style={{
                color: "var(--accent-text)",
                textDecoration: "underline",
              }}
            >
              /integrate
            </Link>
          </Bullet>
        </Section>

        <p
          style={{
            marginTop: 64,
            fontSize: 12,
            color: "var(--text-muted)",
            fontFamily: FONT_MONO,
            lineHeight: 1.6,
          }}
        >
          Full text + citations:{" "}
          <Ext href="https://github.com/ar-agents/ar-agents/blob/main/packages/mercadolibre/docs/rfc-001-argentine-agentic-commerce-2027.md">
            rfc-001-argentine-agentic-commerce-2027.md
          </Ext>{" "}
          · License: CC BY 4.0
        </p>
      </div>
    </main>
  );
}

function Section({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
        }}
      >
        {h}
      </h2>
      {children}
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 16,
        fontWeight: 600,
        margin: "20px 0 6px",
        color: "var(--text)",
      }}
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 14,
        lineHeight: 1.65,
        color: "var(--text-body)",
        margin: "0 0 10px",
      }}
    >
      {children}
    </p>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 14,
        lineHeight: 1.65,
        color: "var(--text-body)",
        margin: "0 0 8px",
        paddingLeft: 18,
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          color: "var(--accent-strong)",
          fontWeight: 700,
        }}
      >
        ·
      </span>
      {children}
    </p>
  );
}

function Numbered({ children }: { children: React.ReactNode }) {
  return (
    <ol
      style={{
        fontSize: 14,
        lineHeight: 1.65,
        color: "var(--text-body)",
        paddingLeft: 22,
        margin: "0 0 8px",
      }}
    >
      {children}
    </ol>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote
      style={{
        margin: "12px 0 12px",
        padding: "12px 18px",
        borderLeft: "3px solid var(--accent-strong)",
        background: "var(--bg-tint)",
        borderRadius: "0 6px 6px 0",
        fontSize: 14,
        lineHeight: 1.6,
        color: "var(--text)",
        fontStyle: "italic",
      }}
    >
      {children}
    </blockquote>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        color: "var(--accent-text)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
      }}
    >
      {children}
    </a>
  );
}
