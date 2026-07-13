import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LangProvider } from "./i18n";
import { Nav } from "./nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Compact, keyword-rich meta description (155 char limit for Google snippet
// truncation). Lead with the umbrella story (open infrastructure for AR
// sociedades-IA), follow with proof points (39 packages, 6 RFCs, audit log).
const META_DESCRIPTION =
  "Infraestructura abierta y un registro de sociedades automatizadas en Argentina, empresas operadas por agentes de IA. Rieles abiertas, El Auditor y un oráculo de buena reputación. Open source.";

const SITE_URL = "https://ar-agents.ar";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ar-agents · creá una sociedad automatizada en Argentina",
    template: "%s · ar-agents",
  },
  description: META_DESCRIPTION,
  keywords: [
    "sociedades de IA",
    "sociedades ia",
    "argentina ai law",
    "argentine ai corporations",
    "ai agent legal framework",
    "ai agent jurisdiction",
    "ai agent infrastructure",
    "agent audit log",
    "rfc",
    "agents.json",
    "agents.md",
    "agent identity",
    "agent liability",
    "argentina",
    "afip",
    "arca",
    "factura electronica",
    "mercado pago",
    "vercel ai sdk",
    "mcp",
    "model context protocol",
    "open source",
    "agent infrastructure",
    "typescript",
  ],
  authors: [{ name: "Nazareno Clemente", url: "https://github.com/naza00000" }],
  creator: "Nazareno Clemente",
  publisher: "ar-agents",
  alternates: {
    canonical: SITE_URL,
    languages: {
      en: SITE_URL,
      es: SITE_URL + "?lang=es",
    },
    types: {
      "application/json": SITE_URL + "/llms.txt",
    },
  },
  openGraph: {
    type: "website",
    siteName: "ar-agents",
    title: "ar-agents · creá una sociedad automatizada en Argentina",
    description:
      "Una empresa operada por agentes de IA. Rieles abiertas (pagos, identidad, facturación, banca) y El Auditor, la prueba firmada de cada decisión. Open source.",
    url: SITE_URL,
    locale: "es_AR",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary_large_image",
    creator: "@nazaclemente",
    site: "@nazaclemente",
  },
  category: "developer-tools",
  applicationName: "ar-agents",
};

// FOUC-safe theme init: read localStorage and set data-theme on <html> before paint.
// Default is dark; only flip to light if explicitly chosen.
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

// Schema.org JSON-LD. Six entities in @graph for rich citation by AI engines
// (Google AI Overviews, Bing Copilot, Perplexity, Claude.ai web search):
//
//   1. SoftwareApplication, the toolkit itself, with sameAs to every external
//      surface (npm, Glama, MCP Registry) so cross-citation works.
//   2. WebSite, site-level metadata.
//   3. Organization, the ar-agents GitHub org.
//   4. Person, Nazareno Clemente, with sameAs to GitHub + npm + email.
//   5. FAQPage, question/answer pairs that LLMs love quoting verbatim.
//   6. HowTo, install + first-call sequence with discrete steps.
//
// dateCreated / dateModified are ISO 8601, search engines use these to
// decide content freshness.
const SITE = "https://ar-agents.ar";
const SCHEMA_DATE_CREATED = "2026-05-05";
const SCHEMA_DATE_MODIFIED = "2026-06-10";

const schemaOrgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": SITE + "/#app",
      name: "ar-agents",
      alternateName: ["ar-agents toolkit", "@ar-agents/*"],
      headline: "Create and register an automated company in Argentina, operated by AI agents",
      description:
        "Open-source infrastructure to create, operate, and prove an automated company (sociedad automatizada) in Argentina, run by AI agents. 39 typed npm packages covering the Argentine state + financial stack (identity, signing, money, customer ops, gazette monitoring, corporate registry), plus a terminal client (@ar-agents/cli) to talk to the coach directly. 6 RFCs covering three-layer liability framework, agent discovery, cross-jurisdictional reciprocity, operational-log specification, asymmetric signature upgrade, and ledger projection. A public registry of conformant implementations. Audit log signed dual HMAC-SHA256 + Ed25519. MIT (code) + CC-BY-4.0 (specs). Deep Mercado Pago toolkit included (@ar-agents/mercadopago, 89 Vercel AI SDK 6 tools) alongside AFIP, banking, and WhatsApp packages.",
      url: SITE,
      image: SITE + "/opengraph-image",
      applicationCategory: ["DeveloperApplication", "BusinessApplication"],
      applicationSubCategory: "Agent infrastructure",
      operatingSystem: "Cross-platform (Edge Runtime, Node.js 20+)",
      softwareVersion: "0.x",
      softwareRequirements:
        "Vercel AI SDK 6+, Node.js 20+ or any Edge Runtime (Vercel Edge, Cloudflare Workers, Deno)",
      downloadUrl: "https://www.npmjs.com/org/ar-agents",
      installUrl: "https://www.npmjs.com/org/ar-agents",
      license: "https://opensource.org/licenses/MIT",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      author: { "@id": SITE + "/#person-naza" },
      creator: { "@id": SITE + "/#person-naza" },
      publisher: { "@id": SITE + "/#org-ar-agents" },
      programmingLanguage: "TypeScript",
      codeRepository: "https://github.com/ar-agents/ar-agents",
      keywords:
        "sociedades de IA, sociedades-ia, AI corporation, agent infrastructure, agent identity, agent liability, agent audit log, RFC, ar-agents, argentina ai law, mercado pago agent, afip arca, factura electronica, whatsapp business, vercel ai sdk, mcp, model context protocol, agents.json, agents.md, edge runtime, open source",
      dateCreated: SCHEMA_DATE_CREATED,
      datePublished: SCHEMA_DATE_CREATED,
      dateModified: SCHEMA_DATE_MODIFIED,
      inLanguage: ["en", "es"],
      isAccessibleForFree: true,
      hasPart: [
        {
          "@type": "SoftwareSourceCode",
          name: "@ar-agents/mercadopago",
          codeRepository:
            "https://github.com/ar-agents/ar-agents/tree/main/packages/mercadopago",
          programmingLanguage: "TypeScript",
        },
        {
          "@type": "SoftwareSourceCode",
          name: "@ar-agents/identity",
          codeRepository:
            "https://github.com/ar-agents/ar-agents/tree/main/packages/identity",
          programmingLanguage: "TypeScript",
        },
        {
          "@type": "SoftwareSourceCode",
          name: "@ar-agents/facturacion",
          codeRepository:
            "https://github.com/ar-agents/ar-agents/tree/main/packages/facturacion",
          programmingLanguage: "TypeScript",
        },
        {
          "@type": "SoftwareSourceCode",
          name: "@ar-agents/whatsapp",
          codeRepository:
            "https://github.com/ar-agents/ar-agents/tree/main/packages/whatsapp",
          programmingLanguage: "TypeScript",
        },
        {
          "@type": "SoftwareSourceCode",
          name: "@ar-agents/banking",
          codeRepository:
            "https://github.com/ar-agents/ar-agents/tree/main/packages/banking",
          programmingLanguage: "TypeScript",
        },
        {
          "@type": "SoftwareSourceCode",
          name: "@ar-agents/shipping",
          codeRepository:
            "https://github.com/ar-agents/ar-agents/tree/main/packages/shipping",
          programmingLanguage: "TypeScript",
        },
        {
          "@type": "SoftwareSourceCode",
          name: "@ar-agents/mcp",
          codeRepository:
            "https://github.com/ar-agents/ar-agents/tree/main/packages/mcp",
          programmingLanguage: "TypeScript",
        },
      ],
      sameAs: [
        "https://www.npmjs.com/package/@ar-agents/mercadopago",
        "https://www.npmjs.com/org/ar-agents",
        "https://glama.ai/mcp/servers/ar-agents/ar-agents",
        "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ar-agents/mcp",
        "https://github.com/ar-agents/ar-agents",
      ],
    },
    {
      "@type": "WebSite",
      "@id": SITE + "/#website",
      name: "ar-agents",
      alternateName: "Infraestructura para sociedades automatizadas",
      url: SITE,
      inLanguage: ["en", "es"],
      publisher: { "@id": SITE + "/#org-ar-agents" },
      potentialAction: {
        "@type": "SearchAction",
        target: SITE + "/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": SITE + "/#org-ar-agents",
      name: "ar-agents",
      url: "https://github.com/ar-agents/ar-agents",
      logo: SITE + "/opengraph-image",
      sameAs: [
        "https://www.npmjs.com/org/ar-agents",
        "https://github.com/ar-agents",
      ],
      founder: { "@id": SITE + "/#person-naza" },
    },
    {
      "@type": "Person",
      "@id": SITE + "/#person-naza",
      name: "Nazareno Clemente",
      url: "https://github.com/naza00000",
      jobTitle: "Independent developer",
      sameAs: [
        "https://github.com/naza00000",
        "https://www.npmjs.com/~naza-ar",
      ],
      knowsAbout: [
        "Mercado Pago API",
        "AFIP/ARCA",
        "Vercel AI SDK",
        "Model Context Protocol",
        "Argentine payment infrastructure",
      ],
    },
    {
      "@type": "FAQPage",
      "@id": SITE + "/#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is ar-agents?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "ar-agents is open-source infrastructure for Argentina's coming 'sociedades de IA' (AI-corporation) regime: 39 npm packages and 245 typed Vercel AI SDK 6 tools that let an AI agent incorporate and operate as an Argentine company end-to-end, identity (CUIT/ARCA), digital signing, money (Mercado Pago, with 89 tools, plus a wallet and treasury layer), e-invoicing (AFIP/ARCA), banking (CBU/CVU + BCRA), WhatsApp Business, shipping (Andreani/OCA/Correo), gazette monitoring (Boletín Oficial), corporate registry (IGJ), a terminal client (@ar-agents/cli), plus 6 RFCs and an HMAC + Ed25519 audit log. MIT (code) + CC-BY-4.0 (specs).",
          },
        },
        {
          "@type": "Question",
          name: "How is this different from the official mercadopago SDK?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The official mercadopago SDK is a thin REST client. It does not ship Vercel AI SDK tool schemas, does not implement webhook HMAC verification with replay protection, does not run on Edge Runtime (Node-only), and does not gate irreversible operations. ar-agents adds all of that on top of the underlying API: 89 typed tools, deterministic idempotency keys derived from inputs, programmatic human-in-the-loop on refund/cancel/delete, npm provenance attestation, Vercel KV adapters via subpath, OpenTelemetry instrumentation. You can use both packages in the same project; ar-agents wraps the underlying API directly without depending on the official SDK.",
          },
        },
        {
          "@type": "Question",
          name: "Does ar-agents work on Edge Runtime?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. The whole package is Web Crypto-based with no node:crypto dependency, so it runs on Vercel Edge Functions, Cloudflare Workers, Deno, and any other V8-isolate runtime. Webhook signature verification, HMAC, and idempotency-key generation all use the Web Crypto API.",
          },
        },
        {
          "@type": "Question",
          name: "What is HITL (human-in-the-loop) in ar-agents?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Eight tools mutate state irreversibly (refund_payment, cancel_subscription, delete_customer_card, etc.). The toolkit accepts a requireConfirmation callback that gates each invocation: the tool function literally will not execute until your callback returns true. This is a programmatic gate, not just an LLM instruction. You can show the user a UI and wait for their explicit approval before any irreversible operation runs.",
          },
        },
        {
          "@type": "Question",
          name: "How does idempotency work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Every POST request gets an auto-generated idempotency key. For LLM-driven retries, four mutating tools (create_payment, create_subscription, create_payment_preference, refund_payment) use a deterministic key derived from a SHA-256 hash of the meaningful inputs (external_reference, amount, payment_method, etc.). Same inputs produce the same key, so retries return the existing resource instead of double-charging the customer.",
          },
        },
        {
          "@type": "Question",
          name: "Is it free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. MIT license. No paid tier, no telemetry phone-home, no usage caps. The package is published to npm under the @ar-agents scope with SLSA v1 provenance attestations.",
          },
        },
        {
          "@type": "Question",
          name: "What about AFIP, WhatsApp, banking, shipping?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sidecar packages cover the rest of the Argentine business stack: @ar-agents/identity (CUIT/CUIL validation + AFIP/ARCA padron lookup with monotributo category and IVA condition), @ar-agents/facturacion (AFIP/ARCA factura electronica via WSFE), @ar-agents/whatsapp (WhatsApp Business Cloud API with HMAC webhook verify and AR phone normalizer), @ar-agents/banking (CBU/CVU validation + BCRA Central de Deudores), @ar-agents/shipping (Andreani, OCA, Correo Argentino), @ar-agents/identity-attest (HMAC-signed verification orchestrator). Each ships independently to npm.",
          },
        },
        {
          "@type": "Question",
          name: "Is there a Model Context Protocol (MCP) server?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. @ar-agents/mcp bundles the ar-agents toolkit into a single MCP server compatible with Claude Desktop, Cursor, Codeium, Continue, Cline, or any MCP host. Auto-detects which packages to enable from environment variables. Listed on Glama (glama.ai/mcp/servers/ar-agents/ar-agents) and the official MCP Registry (io.github.ar-agents/mcp).",
          },
        },
      ],
    },
    {
      "@type": "HowTo",
      "@id": SITE + "/#how-to-install",
      name: "How to use @ar-agents/mercadopago (one of 39 ar-agents packages) in a Vercel AI SDK 6 agent",
      description:
        "Install @ar-agents/mercadopago, instantiate the client, register the tools, and let an LLM agent drive Mercado Pago billing flows from natural-language prompts. One package among 39; see /docs for the full toolkit and the @ar-agents/cli terminal on-ramp.",
      totalTime: "PT5M",
      tool: [
        { "@type": "HowToTool", name: "Node.js 20+ or any Edge Runtime" },
        { "@type": "HowToTool", name: "pnpm or npm or yarn or bun" },
        { "@type": "HowToTool", name: "A Mercado Pago developer account" },
      ],
      supply: [
        {
          "@type": "HowToSupply",
          name: "MP_ACCESS_TOKEN (TEST- prefix for sandbox, APP_USR- for production)",
        },
      ],
      step: [
        {
          "@type": "HowToStep",
          position: 1,
          name: "Install the toolkit",
          text: "Run pnpm add @ar-agents/mercadopago ai zod (or the npm/yarn/bun equivalent) in your Vercel AI SDK 6 project.",
        },
        {
          "@type": "HowToStep",
          position: 2,
          name: "Get a Mercado Pago access token",
          text: "Visit www.mercadopago.com.ar/developers/panel/app, create a test integration, and copy the TEST- access token. Set MP_ACCESS_TOKEN as an environment variable.",
          url: "https://www.mercadopago.com.ar/developers/panel/app",
        },
        {
          "@type": "HowToStep",
          position: 3,
          name: "Wire the agent",
          text: "Import MercadoPagoClient and mercadoPagoTools, instantiate the client with your access token, register the tools with an InMemoryStateAdapter and your backUrl, and pass them to Experimental_Agent from the ai package.",
        },
        {
          "@type": "HowToStep",
          position: 4,
          name: "Send a natural-language prompt",
          text: "Call agent.generate({ prompt: 'Cobrale $25.000 mensual a juan@example.com con razon Plan Pro' }). The agent picks create_subscription, returns an init_point_url to send to the customer.",
        },
        {
          "@type": "HowToStep",
          position: 5,
          name: "Handle webhooks",
          text: "Wire verifyWebhookSignature in your /api/webhook route. The function verifies the HMAC signature, checks the 5-minute replay window, and short-circuits MP retries via the WebhookDedup helper.",
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              ...schemaOrgJsonLd,
              "@graph": schemaOrgJsonLd["@graph"].filter(
                (n: Record<string, unknown>) =>
                  n["@type"] !== "FAQPage" && n["@type"] !== "HowTo",
              ),
            }),
          }}
        />
        {/* Resource hints. Vercel AI Gateway is the only third-party origin
            the live-agent demo hits at runtime. Preconnect saves ~150ms on
            first /api/demo call by warming the TLS handshake. */}
        <link rel="preconnect" href="https://api.gateway.ai.vercel.com" />
        <link rel="dns-prefetch" href="https://api.gateway.ai.vercel.com" />
        {/* Self-references for crawlers + canonical signaling. Next.js
            `metadata.alternates.canonical` already emits a <link rel=canonical>;
            these are extras that some legacy crawlers still expect. */}
        <link rel="me" href="https://github.com/naza00000" />
        {/* Browser search box / OpenSearch, lets users add the site to their
            browser's search engines. Lightweight, only one extra GET. */}
        <link
          rel="search"
          type="application/opensearchdescription+xml"
          title="ar-agents"
          href="/opensearch.xml"
        />
      </head>
      <body suppressHydrationWarning>
        <LangProvider>
          <Nav />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
