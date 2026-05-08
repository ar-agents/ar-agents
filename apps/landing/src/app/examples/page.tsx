import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "Cookbook · 17 production patterns",
  description:
    "17 end-to-end recipes wiring @ar-agents/* into real Argentine business workflows: SaaS subscriptions, marketplace OAuth, anti-fraud, ACP checkout with auto-factura, USA-LLC ↔ AR composition.",
  alternates: { canonical: "https://ar-agents.vercel.app/examples" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const REPO = "https://github.com/ar-agents/ar-agents";
const COOKBOOK = `${REPO}/blob/main/packages/mercadopago/cookbook`;

type Tier = "starter" | "production" | "composition" | "infra";

type Recipe = {
  id: string;
  num: number;
  title: string;
  tier: Tier;
  packages: string[];
  summary: string;
  /** Optional one-liner hook — what makes this recipe noteworthy. */
  highlight?: string;
};

const RECIPES: Recipe[] = [
  {
    id: "01-checkout-pro-basic",
    num: 1,
    title: "Checkout Pro · single sale",
    tier: "starter",
    packages: ["mercadopago"],
    summary:
      "Hosted checkout URL for a one-off purchase. Buyer enters card on MP's form (no PCI scope for you). MP fires payment webhook on completion.",
  },
  {
    id: "02-saas-subscription",
    num: 2,
    title: "SaaS subscription · Plan + first payment + card swap",
    tier: "production",
    packages: ["mercadopago"],
    summary:
      "Reusable Plan, per-customer subscribe_to_plan, recurring auto-charge, card swap on expiration via update_subscription({ card_token_id }).",
    highlight:
      "Card swap is the path that breaks the most production deploys — recipe wires it correctly.",
  },
  {
    id: "03-webhook-handler",
    num: 3,
    title: "Webhook handler · HMAC verify + replay defense",
    tier: "production",
    packages: ["mercadopago"],
    summary:
      "verifyWebhookSignature() + WebhookDedup. 5-minute replay-tolerance window. Auto-fetches the underlying Payment/Preapproval/Order resource and dispatches by topic.",
  },
  {
    id: "04-marketplace-split",
    num: 4,
    title: "Marketplace split · seller OAuth + commission",
    tier: "production",
    packages: ["mercadopago"],
    summary:
      "Rappi / Tienda Nube pattern. Seller connects MP via OAuth, your platform takes a marketplace fee, the rest splits to the seller's MP account. VercelKVOAuthTokenStore for token persistence.",
  },
  {
    id: "05-qr-in-store",
    num: 5,
    title: "In-store QR · POS + WhatsApp confirmation",
    tier: "production",
    packages: ["mercadopago", "whatsapp"],
    summary:
      "Dynamic QR for brick-and-mortar. create_store + create_pos one-time, create_qr_payment per sale. Cashier gets WhatsApp '✓ Cobro $X' notification when payment lands.",
  },
  {
    id: "06-3ds-challenge",
    num: 6,
    title: "3DS challenge · detect → redirect → recover",
    tier: "production",
    packages: ["mercadopago"],
    summary:
      "When MP triggers 3DS (issuer-mandated SCA), detect via status_detail, extract challengeUrl from three_ds_info, redirect, recover after.",
  },
  {
    id: "07-auth-only-order",
    num: 7,
    title: "Auth-only Order · ride-share / hotel pattern",
    tier: "production",
    packages: ["mercadopago"],
    summary:
      "Estimate max upfront, capture actual at completion. Order with capture_mode: 'manual'. Final amount ≤ authorized.",
  },
  {
    id: "08-recovery-patterns",
    num: 8,
    title: "Recovery patterns · 6 stuck states + the right move for each",
    tier: "production",
    packages: ["mercadopago"],
    summary:
      "Card-expired subs, pending_challenge, pending_review_manual, auto-cancelled subs, pending_waiting_payment for cash methods, in_process for offline. The full triage tree.",
  },
  {
    id: "09-otel-wired",
    num: 9,
    title: "OpenTelemetry · spans + metrics end-to-end",
    tier: "infra",
    packages: ["mercadopago"],
    summary:
      "W3C traceparent on every MP API call. mp.request + mp.tool spans. p50/p95/p99 latency + error-rate + rate-limit-remaining metrics. Ships to Honeycomb / Datadog / Grafana Tempo.",
  },
  {
    id: "10-cross-package-billing",
    num: 10,
    title: "Cross-package billing · 5 packages, one agent loop",
    tier: "composition",
    packages: [
      "identity",
      "identity-attest",
      "mercadopago",
      "facturacion",
      "whatsapp",
    ],
    summary:
      "The flagship composability demo. One prompt → CUIT validate → AFIP padron lookup → BCRA credit-situation check → WhatsApp OTP attestation → MP subscription → AFIP factura → WhatsApp PDF delivery.",
    highlight:
      "What would normally be 200 lines of orchestration code, in 30. The killer demo.",
  },
  {
    id: "11-dunning-sequence",
    num: 11,
    title: "Dunning sequence · multi-step revenue recovery",
    tier: "production",
    packages: ["mercadopago", "whatsapp"],
    summary:
      "Day 0/3/7/14/30 escalation tree for failed recurring charges. Maximises revenue recovery, minimises churn. Driven by an agent that picks the right step from prior signals.",
  },
  {
    id: "12-reconciliation-pipeline",
    num: 12,
    title: "Reconciliation pipeline · daily MP ↔ DB diff",
    tier: "production",
    packages: ["mercadopago"],
    summary:
      "Daily batch job. Compares MP settlement records against your billing DB. Surfaces 4 discrepancy classes: missing-on-MP, missing-on-yours, amount-mismatch, refund-not-reflected.",
  },
  {
    id: "13-anti-fraud-middleware",
    num: 13,
    title: "Anti-fraud pre-charge middleware · CUIT + payer + velocity + BCRA",
    tier: "composition",
    packages: ["identity", "banking", "mercadopago"],
    summary:
      "Pre-charge heuristics that score incoming payments. CUIT validity, payer history, transaction velocity, BCRA credit-situation cross-check. Combined into a single risk verdict.",
  },
  {
    id: "14-marketplace-onboarding",
    num: 14,
    title: "Marketplace onboarding · seller verification end-to-end",
    tier: "composition",
    packages: ["identity", "mercadopago", "whatsapp"],
    summary:
      "CUIT validate → AFIP padron lookup → MP OAuth connect → first-test-charge probe → WhatsApp confirmation. Detects monotributo category → tier rules.",
  },
  {
    id: "15-prorated-pause-resume",
    num: 15,
    title: "Prorated pause/resume · the math MP doesn't do for you",
    tier: "production",
    packages: ["mercadopago"],
    summary:
      "Compute days remaining → refund prorated amount → pause sub → on resume, recalculate next billing date. Production maths, not vibes.",
  },
  {
    id: "16-acp-checkout-with-factura",
    num: 16,
    title: "ACP checkout · LLM-buyer + auto-factura",
    tier: "infra",
    packages: ["agentic-commerce-bridge", "mercadopago", "facturacion"],
    summary:
      "Stripe-style hosted checkout where the BUYER is an LLM agent (ChatGPT / Claude / Gemini). On payment confirmation, server auto-emits AFIP factura A/B/C/E with CAE.",
    highlight:
      "Headline pattern that no other LATAM implementation ships out of the box.",
  },
  {
    id: "17-usa-llc-companion",
    num: 17,
    title: "USA-LLC ↔ AR composition · ClawBank / doola / MIDAO consume @ar-agents",
    tier: "infra",
    packages: ["mcp", "identity", "mercadopago", "facturacion", "shipping"],
    summary:
      "USA-incorporated agent does AR business via @ar-agents/mcp + a thin AR-resident facade (escribano / contador / platform partner). The reference pattern for cross-jurisdictional agent commerce.",
    highlight:
      "Wired to RFC-001's three-layer liability framework.",
  },
];

const TIER_LABEL: Record<Tier, string> = {
  starter: "Starter",
  production: "Production patterns",
  composition: "Composition (multi-package)",
  infra: "Infrastructure / agent commerce",
};

const TIER_COLOR: Record<Tier, string> = {
  starter: "#22c55e",
  production: "#06b6d4",
  composition: "#a855f7",
  infra: "#eab308",
};

const PKG_COLOR: Record<string, string> = {
  identity: "#a855f7",
  "identity-attest": "#a855f7",
  "mi-argentina": "#a855f7",
  "firma-digital": "#a855f7",
  mercadopago: "#22c55e",
  banking: "#22c55e",
  facturacion: "#eab308",
  igj: "#eab308",
  "boletin-oficial": "#eab308",
  whatsapp: "#06b6d4",
  shipping: "#f97316",
  "agentic-commerce-bridge": "#64748b",
  ap2: "#64748b",
  mcp: "#64748b",
};

const TIER_ORDER: Tier[] = ["starter", "production", "composition", "infra"];

export default function ExamplesPage() {
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    items: RECIPES.filter((r) => r.tier === tier),
  }));

  const counts = {
    total: RECIPES.length,
    composition: RECIPES.filter((r) => r.tier === "composition").length,
    production: RECIPES.filter((r) => r.tier === "production").length,
  };

  return (
    <DocShell
      eyebrow="/arg · cookbook · 2026-05"
      title="Cookbook."
      subtitle={`${counts.total} production patterns. ${counts.production} battle-tested in real money flows. ${counts.composition} demonstrate cross-package composition. Every recipe is runnable TypeScript.`}
    >
      <DocBlock>
        <DocP>
          The cookbook is the working answer to &quot;what does an agent that
          actually transacts in Argentina look like?&quot; Each recipe is a
          single TypeScript file, fully typed, with the SDK surface, the
          gotchas, and the exact sequence of tool calls. Read it as a
          tutorial, copy as a starter, deploy as production.
        </DocP>
        <DocP>
          Source:{" "}
          <a
            href={`${REPO}/tree/main/packages/mercadopago/cookbook`}
            style={{ color: "var(--accent)" }}
          >
            packages/mercadopago/cookbook
          </a>
          . Every recipe is Edge-Runtime compatible; uncomment{" "}
          <DocCode>export const runtime = &quot;edge&quot;</DocCode> to
          deploy on Vercel Edge / Cloudflare Workers.
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
            {items.map((r) => (
              <article
                id={String(r.num).padStart(2, "0")}
                key={r.id}
                style={{
                  background: "var(--bg)",
                  borderRadius: 8,
                  padding: 18,
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      color: "var(--text-muted)",
                      fontWeight: 600,
                    }}
                  >
                    R{String(r.num).padStart(2, "0")}
                  </span>
                  <a
                    href={`${COOKBOOK}/${r.id}.ts`}
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "var(--text)",
                      textDecoration: "none",
                    }}
                  >
                    {r.title} →
                  </a>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginBottom: 10,
                  }}
                >
                  {r.packages.map((pkg) => (
                    <span
                      key={pkg}
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 10,
                        color: PKG_COLOR[pkg] ?? "var(--text-muted)",
                        border: `1px solid ${PKG_COLOR[pkg] ?? "var(--text-muted)"}`,
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
                    fontSize: 14,
                    color: "var(--text-body)",
                    lineHeight: 1.55,
                  }}
                >
                  {r.summary}
                </div>
                {r.highlight ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: TIER_COLOR[tier],
                      marginTop: 8,
                      fontStyle: "italic",
                      lineHeight: 1.5,
                    }}
                  >
                    → {r.highlight}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}

      <DocH2>How to run a recipe locally</DocH2>
      <DocP>
        Each recipe assumes you&apos;ve installed the relevant{" "}
        <DocCode>@ar-agents/*</DocCode> packages. Then:
      </DocP>
      <pre
        style={{
          background: "var(--bg-tint)",
          padding: "16px",
          borderRadius: 8,
          fontSize: 13,
          fontFamily: FONT_MONO,
          color: "var(--text-body)",
          overflow: "auto",
          boxShadow: "var(--shadow-border)",
        }}
      >
{`# clone the repo (recipes import from the workspace, but the same
# code works against published @ar-agents/* npm packages)
git clone https://github.com/ar-agents/ar-agents
cd ar-agents
pnpm install

# set env vars (MP token, AFIP cert, etc — see each recipe's header)
cp .env.example .env.local
$EDITOR .env.local

# run a recipe
pnpm tsx packages/mercadopago/cookbook/10-cross-package-billing.ts`}
      </pre>

      <DocH2>What recipe is missing for your case?</DocH2>
      <DocP>
        Cookbook gaps are the best signal of where the toolkit needs to go
        next. Open an issue at{" "}
        <a
          href={`${REPO}/issues/new?labels=cookbook&template=cookbook-request.md`}
          style={{ color: "var(--accent)" }}
        >
          {REPO}/issues
        </a>{" "}
        with the use case and the API surface you wish existed — most new
        recipes start as a one-paragraph issue.
      </DocP>
    </DocShell>
  );
}
