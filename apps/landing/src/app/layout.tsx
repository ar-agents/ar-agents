import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LangProvider } from "./i18n";
import { Toggles } from "./toggles";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mercado Pago Agent Toolkit · Built on Vercel",
  description:
    "@ar-agents/mercadopago: 89 typed tools across the agent-relevant Mercado Pago API surface (Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Order Management, Customers, Cards, Cuotas, QR, 3DS, Point, Webhooks, Stores+POS, Settlements, Disputes, Lookups, Bank Accounts) for the Vercel AI SDK 6.",
  openGraph: {
    title: "Mercado Pago Agent Toolkit",
    description:
      "89 typed tools across the agent-relevant Mercado Pago API surface, for the Vercel AI SDK 6. Edge Runtime, Vercel KV adapters, OpenTelemetry.",
  },
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

// Schema.org JSON-LD. Helps Google + LLM crawlers understand what the page
// actually is — a SoftwareApplication (the toolkit). The dual SoftwareSource
// + Organization marks the npm package + the maintaining org so search
// surfaces (Google AI Overviews, Bing, Perplexity) can attribute links and
// build rich result cards. Author dataset for Naza pinned on the org.
const schemaOrgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://ar-agents.vercel.app/#app",
      name: "Mercado Pago Agent Toolkit",
      alternateName: "@ar-agents/mercadopago",
      description:
        "89 typed Mercado Pago tools (Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Cuotas, QR, 3DS, Point devices, Webhooks) for the Vercel AI SDK 6.",
      url: "https://ar-agents.vercel.app",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Cross-platform (Edge Runtime, Node.js 20+)",
      softwareVersion: "0.15.3",
      license: "https://opensource.org/licenses/MIT",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: { "@id": "https://github.com/naza00000#person" },
      publisher: { "@id": "https://github.com/ar-agents#org" },
      programmingLanguage: "TypeScript",
      codeRepository: "https://github.com/ar-agents/ar-agents",
      sameAs: [
        "https://www.npmjs.com/package/@ar-agents/mercadopago",
        "https://glama.ai/mcp/servers/ar-agents/ar-agents",
      ],
    },
    {
      "@type": "Organization",
      "@id": "https://github.com/ar-agents#org",
      name: "ar-agents",
      url: "https://github.com/ar-agents/ar-agents",
      sameAs: ["https://www.npmjs.com/org/ar-agents"],
    },
    {
      "@type": "Person",
      "@id": "https://github.com/naza00000#person",
      name: "Nazareno Clemente",
      url: "https://github.com/naza00000",
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
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrgJsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <LangProvider>
          <Toggles />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
