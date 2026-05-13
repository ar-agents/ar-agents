import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "Templates · 1-click Vercel deploys",
  description:
    "5 Vercel-deployable templates wiring @ar-agents/* into common production patterns: SaaS billing, marketplace, ACP checkout, MCP host, sociedad-IA starter. Each one ships agentic flows on Edge Runtime.",
  alternates: { canonical: "https://ar-agents.ar/templates" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type Tier = "starter" | "production" | "infra";

type Template = {
  id: string;
  title: string;
  tier: Tier;
  description: string;
  packages: string[];
  envVars: string[];
  /** Cookbook recipe number this template is built from. */
  recipe?: number;
  /** Where the canonical source lives (GitHub URL, must resolve). */
  source: string;
  /** Status of the published template repo. */
  status: "live" | "alpha" | "soon";
};

const REPO = "https://github.com/ar-agents/ar-agents";
const RECIPE_BASE = `${REPO}/blob/main/packages/mercadopago/cookbook`;
const APPS_BASE = `${REPO}/tree/main/apps`;
const PKG_BASE = `${REPO}/tree/main/packages`;

const TEMPLATES: Template[] = [
  {
    id: "sociedad-ia-starter",
    title: "Sociedad-IA starter",
    tier: "starter",
    description:
      "The flagship template. Wires the 8 most-common @ar-agents/* packages (identity, gde-tad, mercadopago, banking, facturacion, igj, boletin-oficial, whatsapp) into a single Next.js app with: agent endpoint, MP webhook receiver, morning-cron operating loop, status page. Configurable via env vars only, degrades gracefully if any client is missing.",
    packages: [
      "identity",
      "gde-tad",
      "mercadopago",
      "banking",
      "facturacion",
      "igj",
      "boletin-oficial",
      "whatsapp",
    ],
    envVars: ["AFIP_CERT_PEM", "AFIP_KEY_PEM", "AFIP_CUIT", "MERCADOPAGO_ACCESS_TOKEN"],
    source: `${APPS_BASE}/sociedad-ia-starter`,
    status: "live",
  },
  {
    id: "saas-billing",
    title: "SaaS billing on Mercado Pago",
    tier: "production",
    description:
      "Reusable Plan + per-customer subscribe_to_plan + recurring auto-charge + card swap on expiration. The closest you can get to Stripe-billing-on-Argentine-rails. Includes webhook handler with HMAC verify + replay defense + dunning sequence. Source: cookbook recipe R02 (single-file, lift into a Next.js app of your choice).",
    packages: ["mercadopago", "facturacion", "whatsapp"],
    envVars: ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET", "AFIP_CERT_PEM"],
    recipe: 2,
    source: `${RECIPE_BASE}/02-saas-subscription.ts`,
    status: "alpha",
  },
  {
    id: "marketplace",
    title: "Marketplace · seller OAuth + split",
    tier: "production",
    description:
      "Rappi / Tienda Nube pattern. Seller OAuth onboarding, marketplace fee split, AFIP padron validation on each new seller, monotributo-category-aware tier rules. VercelKVOAuthTokenStore for token persistence. Source: cookbook recipe R04.",
    packages: ["mercadopago", "identity", "whatsapp"],
    envVars: ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_OAUTH_CLIENT_ID"],
    recipe: 4,
    source: `${RECIPE_BASE}/04-marketplace-split.ts`,
    status: "alpha",
  },
  {
    id: "acp-checkout",
    title: "ACP checkout · LLM-buyer storefront",
    tier: "infra",
    description:
      "Stripe-style hosted checkout where the buyer is an LLM agent (ChatGPT Instant Checkout / Claude tool calls / Gemini extensions). Server auto-emits AFIP/ARCA factura A/B/C/E on payment confirmation. /.well-known/acp.json discovery built in. Reference impl in apps/bridge-hello + cookbook recipe R16.",
    packages: ["agentic-commerce-bridge", "mercadopago", "facturacion"],
    envVars: ["MERCADOPAGO_ACCESS_TOKEN", "ACP_SHARED_SECRET", "AFIP_CERT_PEM"],
    recipe: 16,
    source: `${APPS_BASE}/bridge-hello`,
    status: "live",
  },
  {
    id: "mcp-host",
    title: "MCP host · Claude Desktop / Cursor / Continue",
    tier: "infra",
    description:
      "Bundles the full @ar-agents/mcp toolkit as a stdio MCP server you can drop into any MCP client. Configure with the same env vars as the underlying packages; the doctor CLI (ar-agents-mcp doctor) tells you which surfaces are wired. Use this when you want every AR ops capability available from inside an existing host.",
    packages: ["mcp"],
    envVars: ["AFIP_CERT_PEM", "AFIP_KEY_PEM", "AFIP_CUIT", "MERCADOPAGO_ACCESS_TOKEN"],
    source: `${PKG_BASE}/mcp`,
    status: "live",
  },
];

const TIER_LABEL: Record<Tier, string> = {
  starter: "Starter",
  production: "Production patterns",
  infra: "Infrastructure / agent commerce",
};

const TIER_COLOR: Record<Tier, string> = {
  starter: "#22c55e",
  production: "#06b6d4",
  infra: "#eab308",
};

const STATUS_LABEL: Record<Template["status"], string> = {
  live: "Live",
  alpha: "Alpha, clone-ready",
  soon: "Coming soon",
};

const STATUS_COLOR: Record<Template["status"], string> = {
  live: "#22c55e",
  alpha: "#eab308",
  soon: "var(--text-muted)",
};

const TIER_ORDER: Tier[] = ["starter", "production", "infra"];

export default function TemplatesPage() {
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    items: TEMPLATES.filter((t) => t.tier === tier),
  }));

  return (
    <DocShell
      eyebrow="templates · alpha"
      title="Templates."
      subtitle="5 Vercel-deployable templates that drop @ar-agents/* into common production patterns. Each one ships on Edge Runtime, ships an Experimental_Agent loop, and handles the gotchas the cookbook documents. 1-click deploy. SLSA-provenanced dependencies."
    >
      <DocBlock>
        <DocP>
          The toolkit ships libraries; the templates ship runnable applications.
          Templates are the answer to &quot;I&apos;ve read the docs, now show
          me the canonical way to wire this for my use case.&quot; They are
          the &quot;hello world&quot; you would write yourself, except that
          the maintainer already wrote it and ran it in production at Astro.
        </DocP>
        <DocP>
          Each template clones from a versioned subtree of the main repo and
          deploys on Vercel via 1-click clone. Env vars are documented per
          template; on first deploy the cron jobs are pre-scheduled, the
          webhook URLs are pre-generated, the audit log is pre-wired.
        </DocP>
      </DocBlock>

      {grouped.map(({ tier, items }) => (
        <section key={tier} style={{ marginBottom: 32 }}>
          <DocH2>
            <span style={{ color: TIER_COLOR[tier] }}>●</span>{" "}
            {TIER_LABEL[tier]}{" "}
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 13,
                color: "var(--text-muted)",
                fontWeight: 400,
                marginLeft: 6,
              }}
            >
              · {items.length}
            </span>
          </DocH2>

          <div style={{ display: "grid", gap: 12 }}>
            {items.map((t) => {
              const deployUrl = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(t.source)}&project-name=${encodeURIComponent(t.id)}&env=${encodeURIComponent(t.envVars.join(","))}`;
              return (
                <article
                  key={t.id}
                  style={{
                    background: "var(--bg)",
                    padding: 18,
                    borderRadius: 8,
                    boxShadow: "var(--card-shadow)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "baseline",
                      marginBottom: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      {t.title}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 11,
                        color: STATUS_COLOR[t.status],
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                    {t.recipe ? (
                      <a
                        href={`/examples#${String(t.recipe).padStart(2, "0")}`}
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 11,
                          color: "var(--text-muted)",
                          textDecoration: "none",
                        }}
                      >
                        recipe R{String(t.recipe).padStart(2, "0")} →
                      </a>
                    ) : null}
                  </div>

                  <DocP>{t.description}</DocP>

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      marginBottom: 14,
                    }}
                  >
                    {t.packages.map((pkg) => (
                      <span
                        key={pkg}
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 10,
                          color: "var(--text-muted)",
                          border: "1px solid var(--text-muted)",
                          borderRadius: 999,
                          padding: "2px 8px",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {pkg}
                      </span>
                    ))}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <a
                      href={deployUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        background: "#000",
                        color: "#fff",
                        textDecoration: "none",
                        padding: "8px 14px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: FONT_MONO,
                        fontWeight: 600,
                      }}
                    >
                      ▲ Deploy
                    </a>
                    <a
                      href={t.source}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        background: "var(--bg-tint)",
                        color: "var(--text)",
                        textDecoration: "none",
                        padding: "8px 14px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: FONT_MONO,
                        fontWeight: 600,
                      }}
                    >
                      Source →
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <DocH2>How a template is structured</DocH2>
      <DocP>
        Every template follows the same skeleton: a Next.js app with one{" "}
        <DocCode>app/api/agent/route.ts</DocCode> that owns the agent loop, a{" "}
        <DocCode>app/api/webhook/[provider]/route.ts</DocCode> per upstream,
        an <DocCode>app/cron/morning/route.ts</DocCode> wired to Vercel Cron,
        and a single <DocCode>lib/agent.ts</DocCode> that builds the{" "}
        <DocCode>Experimental_Agent</DocCode> with all needed tool collections
        spread in. Reading one template teaches all of them.
      </DocP>

      <DocH2>What&apos;s different from rolling your own</DocH2>
      <DocP>
        <strong>Edge-Runtime first.</strong> Templates use{" "}
        <DocCode>export const runtime = &quot;edge&quot;</DocCode> on every
        route. Cold starts &lt; 100ms. Web Crypto only. No Node-specific
        deps surface in the agent loop.
      </DocP>
      <DocP>
        <strong>HMAC audit log on by default.</strong> Every tool call is
        wrapped in <DocCode>AuditLogger.wrap()</DocCode> with timestamp
        signing. RFC-001 § 9 compliance out of the box.
      </DocP>
      <DocP>
        <strong>HITL gates pre-wired.</strong> The 8 irreversible tools have
        the <DocCode>requireConfirmation</DocCode> callback set to a
        Slack-style approval URL by default. Replace with your own UI when
        ready.
      </DocP>
      <DocP>
        <strong>OpenTelemetry-ready.</strong> Templates wire the toolkit&apos;s
        OTel instrumentation behind an env-var flag. Set{" "}
        <DocCode>OTEL_EXPORTER_OTLP_ENDPOINT</DocCode> and traces start
        flowing.
      </DocP>

      <DocH2>Submission to Vercel marketplace</DocH2>
      <DocP>
        We&apos;re submitting these to{" "}
        <a
          href="https://vercel.com/templates"
          style={{ color: "var(--accent)" }}
        >
          vercel.com/templates
        </a>{" "}
        in batches. The MCP-host template is in review. Sociedad-IA starter
        is next. Watch the{" "}
        <a href={`${REPO}/releases`} style={{ color: "var(--accent)" }}>
          releases
        </a>{" "}
        feed for status.
      </DocP>
    </DocShell>
  );
}
