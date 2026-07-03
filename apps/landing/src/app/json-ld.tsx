/**
 * Shared JSON-LD components. Each emits a `<script type="application/ld+json">`
 * tag with schema.org-typed data. Used on top-traffic pages so search engines
 * + AI crawlers (Google, Bing, ChatGPT, Perplexity, Claude, etc.) get rich
 * structured data, improves snippet quality, rich results, and the
 * accuracy of AI summaries that link to the page.
 *
 * Pattern: drop the component just before the closing `</main>` (or anywhere
 * in the React tree, Next collapses to HTML <head>/body irrespective).
 *
 * No client JS, these render server-side as static script tags.
 */

const SITE_URL = "https://ar-agents.ar";
const REPO_URL = "https://github.com/ar-agents/ar-agents";

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page-specific schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Home page, Organization + WebSite + SoftwareApplication. */
export function HomeJsonLd() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "ar-agents",
          url: SITE_URL,
          logo: `${SITE_URL}/icon.png`,
          description:
            "Open-source toolkit and reference implementation for Argentine sociedades automatizadas (Sociedad Automatizada, art. 14), companies that run on AI agents under Argentina's proposed regime.",
          sameAs: [REPO_URL, "https://www.npmjs.com/org/ar-agents"],
          founder: {
            "@type": "Person",
            name: "Nazareno Clemente",
            email: "naza@naza.ar",
          },
          areaServed: {
            "@type": "Country",
            name: "Argentina",
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          url: SITE_URL,
          name: "ar-agents",
          description:
            "Open-source toolkit and reference implementation for Argentine sociedades automatizadas. 37 npm packages, 243 tools, 5 hosted endpoints.",
          inLanguage: ["es-AR", "en"],
          potentialAction: {
            "@type": "SearchAction",
            target: `${SITE_URL}/api/discovery?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "ar-agents toolkit",
          applicationCategory: "DeveloperApplication",
          applicationSubCategory: "AI Agent SDK",
          operatingSystem: "Node.js 20+, Edge Runtime, Cloudflare Workers, Deno, browsers",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          softwareVersion: "1.0",
          license: "https://opensource.org/licenses/MIT",
          url: SITE_URL,
          downloadUrl: "https://www.npmjs.com/org/ar-agents",
          codeRepository: REPO_URL,
          programmingLanguage: "TypeScript",
          aggregateRating: undefined,
          author: {
            "@type": "Person",
            name: "Nazareno Clemente",
          },
        }}
      />
    </>
  );
}

/** /sdk, SoftwareSourceCode for the npm package. */
export function SdkJsonLd() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareSourceCode",
          name: "@ar-agents/incorporate",
          description:
            "Zero-dependency TypeScript client for /api/auto-incorporate. One async call returns the full AR sociedad automatizada incorporation kit.",
          codeRepository: `${REPO_URL}/tree/main/packages/incorporate`,
          programmingLanguage: "TypeScript",
          runtimePlatform: "Node.js 20+, Edge, Cloudflare Workers, Deno, browser",
          license: "https://opensource.org/licenses/MIT",
          url: `${SITE_URL}/sdk`,
          downloadUrl: "https://www.npmjs.com/package/@ar-agents/incorporate",
          author: {
            "@type": "Person",
            name: "Nazareno Clemente",
          },
        }}
      />
    </>
  );
}

/** /rfcs/001, TechArticle for the governance RFC. */
export function RfcJsonLd({
  id,
  title,
  abstract,
  datePublished,
}: {
  id: string;
  title: string;
  abstract: string;
  datePublished: string;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: title,
        abstract,
        url: `${SITE_URL}/rfcs/${id}`,
        datePublished,
        author: {
          "@type": "Person",
          name: "Nazareno Clemente",
          email: "naza@naza.ar",
        },
        publisher: {
          "@type": "Organization",
          name: "ar-agents",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
        },
        inLanguage: "es-AR",
        keywords: [
          "sociedad-ia",
          "argentina",
          "ai-agent-governance",
          "rfc",
          "audit-log",
          "hmac",
          "liability-framework",
        ],
        isAccessibleForFree: true,
        license: "https://creativecommons.org/licenses/by/4.0/",
      }}
    />
  );
}

/** /incorporar, HowTo for the wizard. */
export function IncorporarJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Cómo constituir una sociedad automatizada argentina",
        description:
          "Wizard guiado para constituir una empresa argentina operada por IA bajo el régimen propuesto por Sturzenegger (anuncio 28-abr-2026).",
        url: `${SITE_URL}/incorporar`,
        totalTime: "PT10M",
        estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: 0 },
        supply: [
          { "@type": "HowToSupply", name: "Una denominación social (3-200 caracteres, no reservada por IGJ)" },
          { "@type": "HowToSupply", name: "Capital social en ARS (mínimo según tipo)" },
          { "@type": "HowToSupply", name: "Objeto social específico (mínimo 20 caracteres)" },
        ],
        tool: [
          { "@type": "HowToTool", name: "@ar-agents/* npm packages (37 paquetes)" },
          { "@type": "HowToTool", name: "Vercel one-click deploy" },
          { "@type": "HowToTool", name: "ARCA cert X.509 (post-launch)" },
        ],
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Completar el wizard con denominación + tipo + capital + objeto",
            text: "El pre-flight de IGJ corre en vivo según las reglas del tool validate_igj_inscription.",
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Descargar los 4 archivos generados",
            text: "package.json, lib/agent.ts, .env.example, README.md.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Click Deploy en Vercel",
            text: "El one-click deploy clona apps/sociedad-ia-starter con los env-vars pre-rellenados.",
          },
          {
            "@type": "HowToStep",
            position: 4,
            name: "Cargar credenciales reales (ARCA cert, MP token, WhatsApp)",
            text: "Cada cliente externo degrada graciosamente cuando su env-var está ausente.",
          },
          {
            "@type": "HowToStep",
            position: 5,
            name: "Inscripción IGJ vía TAD",
            text: "El tool validate_igj_inscription en el repo cubre las reglas pre-flight.",
          },
        ],
      }}
    />
  );
}

/** /sociedades-ia, TechArticle on the regime alignment. */
export function SociedadesIaJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline:
          "Implementación de referencia para sociedades automatizadas en Argentina",
        description:
          "El anuncio de Sturzenegger del 28-abr-2026 derivó en un anteproyecto (texto firmado el 28-may-2026, hoy en el Senado) que crea la Sociedad Automatizada (art. 14): empresas que operan con agentes de IA, sin empleados en relación de dependencia. Esta página documenta cómo el toolkit @ar-agents/* implementa las 17 piezas operativas necesarias.",
        url: `${SITE_URL}/sociedades-ia`,
        author: {
          "@type": "Person",
          name: "Nazareno Clemente",
        },
        publisher: {
          "@type": "Organization",
          name: "ar-agents",
          logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
        },
        inLanguage: "es-AR",
        about: [
          { "@type": "Thing", name: "Sociedad Automatizada" },
          { "@type": "Thing", name: "Sociedad de IA" },
          { "@type": "Thing", name: "Argentina" },
          { "@type": "Thing", name: "Federico Sturzenegger" },
          { "@type": "Thing", name: "Ley General de Sociedades" },
        ],
        keywords: [
          "sociedad-ia",
          "argentina",
          "sturzenegger",
          "ley-de-sociedades",
          "ai-corporate-governance",
        ],
      }}
    />
  );
}

/** /security, TechArticle on the threat model. */
export function SecurityJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: "Security threat model · ar-agents",
        description:
          "18 explicit threats, 18 explicit mitigations. STRIDE-inspired threat model for an agent toolkit that moves money in Argentina.",
        url: `${SITE_URL}/security`,
        author: { "@type": "Person", name: "Nazareno Clemente" },
        publisher: {
          "@type": "Organization",
          name: "ar-agents",
          logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
        },
        inLanguage: "en",
        about: [
          { "@type": "Thing", name: "STRIDE threat modeling" },
          { "@type": "Thing", name: "OWASP LLM Top 10" },
          { "@type": "Thing", name: "AI agent security" },
        ],
      }}
    />
  );
}

/**
 * /constancia/[cuit], per-CUIT proof page. A `WebPage` whose `mainEntity` is
 * the yes/no question the page answers, plus `about` the CUIT (and, once the
 * good-standing verdict is real, the denominación). Honest: only emits data
 * the page actually has.
 */
export function ConstanciaProofJsonLd({
  cuit,
  pretty,
  valid,
  verdictAvailable,
  denominacion,
}: {
  cuit: string;
  pretty: string;
  valid: boolean;
  verdictAvailable: boolean;
  denominacion?: string | null;
}) {
  const about: object[] = [{ "@type": "Thing", name: `CUIT ${pretty}` }];
  if (verdictAvailable && denominacion) {
    about.push({ "@type": "Organization", name: denominacion });
  }
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `Constancia ${pretty}`,
        url: `${SITE_URL}/constancia/${cuit}`,
        inLanguage: "es-AR",
        isPartOf: { "@type": "WebSite", name: "ar-agents", url: SITE_URL },
        description: valid
          ? `El CUIT ${pretty} pasa el dígito verificador (mod-11). Verificado por ar-agents.`
          : `El CUIT ${pretty} no pasa el dígito verificador (mod-11). Verificado por ar-agents.`,
        mainEntity: {
          "@type": "Question",
          name: `¿El CUIT ${pretty} es válido?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: valid
              ? "Sí, pasa el dígito verificador (mod-11)."
              : "No, no pasa el dígito verificador (mod-11).",
          },
        },
        about,
        publisher: {
          "@type": "Organization",
          name: "ar-agents",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
        },
      }}
    />
  );
}

/**
 * /constancia hub, FAQPage + SoftwareApplication so the free CUIT-verification
 * tool is eligible for FAQ rich results and LLM citation. `faq` items come
 * from the page so copy stays in one place.
 */
export function ConstanciaHubJsonLd({
  faq,
}: {
  faq: ReadonlyArray<{ q: string; a: string }>;
}) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Constancia Oracle",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: `${SITE_URL}/constancia`,
          description:
            "Verificá cualquier CUIT argentino: validación del dígito verificador gratis e instantánea, con badge para embeber. La buena situación fiscal de ARCA es un tier premium.",
          inLanguage: "es-AR",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          author: { "@type": "Organization", name: "ar-agents", url: SITE_URL },
        }}
      />
      {faq.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            inLanguage: "es-AR",
            mainEntity: faq.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }}
        />
      )}
    </>
  );
}

/** /examples, generic ItemList of cookbook recipes. */
export function ExamplesJsonLd({
  recipes,
}: {
  recipes: Array<{ id: string; num: number; title: string; summary: string }>;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "ar-agents cookbook",
        description: "Production patterns for operating an AR business with an LLM agent.",
        url: `${SITE_URL}/examples`,
        numberOfItems: recipes.length,
        itemListElement: recipes.map((r) => ({
          "@type": "ListItem",
          position: r.num,
          name: r.title,
          description: r.summary,
          url: `${SITE_URL}/examples#${String(r.num).padStart(2, "0")}`,
        })),
      }}
    />
  );
}
