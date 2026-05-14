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

const META_DESCRIPTION =
  "Mercado Libre Agent Toolkit for the Vercel AI SDK 6. Production-grade typed SDK MELI stopped shipping in Feb 2022. 14 AI tools, 9 domains, OAuth coalescing, /myfeeds replay, edge-runtime ready.";

const SITE_URL = "https://mercadolibre.ar-agents.ar";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Mercado Libre Agent Toolkit · Built on Vercel",
    template: "%s · @ar-agents/mercadolibre",
  },
  description: META_DESCRIPTION,
  keywords: [
    "mercado libre",
    "mercadolibre",
    "meli",
    "vercel ai sdk",
    "ai agent toolkit",
    "argentina",
    "argentine ecommerce",
    "marketplace",
    "category predictor",
    "mercado envios",
    "mediation",
    "claims",
    "reputation",
    "promotions",
    "myfeeds",
    "oauth",
    "edge runtime",
    "mcp",
    "model context protocol",
    "typescript",
    "agent tools",
    "latam",
    "MLA",
    "MLB",
    "MLM",
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
  },
  openGraph: {
    type: "website",
    siteName: "@ar-agents/mercadolibre",
    title: "Mercado Libre Agent Toolkit",
    description:
      "14 typed Vercel AI SDK 6 tools for the agent-relevant Mercado Libre API surface. Production-grade since day one. The SDK MELI stopped shipping when they archived mercadolibre/nodejs-sdk in Feb 2022.",
    url: SITE_URL,
    locale: "en_US",
    alternateLocale: ["es_AR"],
  },
  twitter: {
    card: "summary_large_image",
    creator: "@nazaclemente",
    site: "@nazaclemente",
  },
  category: "developer-tools",
  applicationName: "@ar-agents/mercadolibre",
};

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

const SCHEMA_DATE_CREATED = "2026-05-09";
const SCHEMA_DATE_MODIFIED = "2026-05-09";

const schemaOrgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": SITE_URL + "/#app",
      name: "Mercado Libre Agent Toolkit",
      alternateName: ["@ar-agents/mercadolibre"],
      headline: "The Mercado Libre SDK that MELI stopped shipping",
      description:
        "14 typed Vercel AI SDK 6 tools across 9 Mercado Libre domains: items + category predictor, questions + spam classifier, orders + packs, claims + 2-day SLA defender, Mercado Envios shipments + labels, seller reputation thermometer, promotions + margin guard, webhooks + 2-day /myfeeds replay. OAuth single-use refresh-token coalescing, idempotent-only retry by default, edge-runtime ready, telemetry hooks for OpenTelemetry/Sentry/Datadog.",
      url: SITE_URL,
      applicationCategory: ["DeveloperApplication", "BusinessApplication"],
      applicationSubCategory: "E-commerce SDK",
      operatingSystem: "Cross-platform (Edge Runtime, Node.js 20+)",
      softwareVersion: "0.1.0",
      softwareRequirements: "Vercel AI SDK 6+, Node.js 20+ or any Edge Runtime",
      downloadUrl: "https://www.npmjs.com/package/@ar-agents/mercadolibre",
      installUrl: "https://www.npmjs.com/package/@ar-agents/mercadolibre",
      license: "https://opensource.org/licenses/MIT",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      author: {
        "@type": "Person",
        name: "Nazareno Clemente",
        url: "https://github.com/naza00000",
      },
      programmingLanguage: "TypeScript",
      codeRepository:
        "https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre",
      keywords:
        "mercado libre, meli, agent, ai sdk, vercel, argentina, marketplace, category predictor, mercado envios, claims, mediation, reputation, promotions, myfeeds, oauth, edge runtime, mcp, model context protocol",
      dateCreated: SCHEMA_DATE_CREATED,
      datePublished: SCHEMA_DATE_CREATED,
      dateModified: SCHEMA_DATE_MODIFIED,
      inLanguage: ["en", "es"],
      isAccessibleForFree: true,
      sameAs: [
        "https://www.npmjs.com/package/@ar-agents/mercadolibre",
        "https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre",
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
