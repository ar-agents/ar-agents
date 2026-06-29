import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { ExamplesJsonLd } from "../json-ld";

export const metadata: Metadata = {
  title: "Cookbook · 30 production patterns",
  description:
    "30 end-to-end recipes wiring @ar-agents/* into real Argentine business workflows: SaaS subscriptions, marketplace OAuth, anti-fraud, ACP checkout with auto-factura, USA-LLC to AR composition.",
  alternates: { canonical: "https://ar-agents.ar/examples" },
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
  /** Optional one-liner hook, what makes this recipe noteworthy. */
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
      "Card swap is the path that breaks the most production deploys, recipe wires it correctly.",
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
  {
    id: "18-usa-llc-self-incorporates-ar",
    num: 18,
    title: "USA-LLC self-incorporates AR sociedad automatizada · one-call programmatic flow",
    tier: "infra",
    packages: ["incorporate", "ap2", "agentic-commerce-bridge"],
    summary:
      "USA-LLC agent calls @ar-agents/incorporate's `incorporate({...})` to spin up an AR sociedad automatizada's deploy spec in one call. Receives generated package.json + agent.ts + .env.example + README.md + Vercel deploy URL + signed audit-log reference. Chains incorporation + ongoing operations under a single forensic timeline.",
    highlight:
      "The headline claim of /sociedades-ia made fully programmatic. `pnpm add @ar-agents/incorporate` + 1 await.",
  },
  {
    id: "19-forensic-compliance-dashboard",
    num: 19,
    title: "Forensic compliance dashboard · scheduled audit-log ingest + alerting",
    tier: "production",
    packages: ["incorporate"],
    summary:
      "Daily cron-driven Node.js script that ingests audit entries via fetchAudit(sessionId, { verify: true }), buckets by tool / governance / latency, surfaces anomalies (tampering, error-rate spikes, p95 regressions), and renders a contador-friendly Spanish summary for monthly compliance reports. The pattern that turns RFC-001 § 9.2's 'legally probative' into actually monitored.",
    highlight:
      "Multi-tenant marketplaces operating many sociedades automatizadas scale linearly with this, one digest per tenant, escalation on tampered.",
  },
  {
    id: "20-multi-tenant-marketplace",
    num: 20,
    title: "Multi-tenant marketplace · spawn vendor sociedades automatizadas on signup",
    tier: "infra",
    packages: ["incorporate"],
    summary:
      "Vertical SaaS / marketplace pattern: each new vendor signing up gets a fresh sociedad automatizada spec materialized via @ar-agents/incorporate, audit log keyed by tenantId. Pieza selection driven by vendor profile (ecommerce → +shipping, large-revenue → +whatsapp/ACP/AP2). Includes the platform-side compliance sweep that fan-outs recipe 19 across tenants, and the badge SVG embed for vendor profile pages.",
    highlight:
      "Pre-toolkit, this was a manual escribano job per vendor. Post-toolkit: ~50 lines + idempotent.",
  },
  {
    id: "21-cross-jurisdictional-ap2",
    num: 21,
    title: "Cross-jurisdictional commerce · USA-LLC + AR sociedad automatizada + AP2 mandate",
    tier: "infra",
    packages: ["incorporate", "ap2", "facturacion", "identity", "banking"],
    summary:
      "USA-LLC sells to AR consumer; AR sociedad automatizada verifies AP2 mandate (ES256/JWS), enforces per-op + monthly + idempotent caps, runs CUIT validity + BCRA credit checks, then emits factura A/B/C under its own CUIT. Each refusal lands as an audit entry that's challengeable later. The reference implementation of RFC-001 § 7's cross-jurisdictional contract surface.",
    highlight:
      "5 verification gates + idempotency + audit-log-as-evidence in ~250 lines. Wyoming DAO LLC plugs into AR jurisdiction without refactoring its agent.",
  },
  {
    id: "22-mp-webhook-afip-reconciliation",
    num: 22,
    title: "Nightly MP ↔ AFIP reconciliation · drift detection + auto-correction",
    tier: "production",
    packages: ["facturacion", "mercadopago", "incorporate"],
    summary:
      "Daily cron that cross-references MP payments against AFIP-issued CAEs against the audit log. Surfaces 3 drift classes (MP paid + no factura, factura + no MP payment, duplicate MP payments + one factura), auto-corrects the safe ones (re-emit factura on MP-paid orphans), and renders a contador-friendly Spanish digest for monthly compliance. The pattern that catches every silent failure in the AFIP/MP bridge.",
    highlight:
      "AFIP fails ~30% of mechanical CAE requests. WSFE silent failures + MP retries make drift inevitable. Recipe 22 is the floor.",
  },
  {
    id: "23-astro-arg-reference-customer",
    num: 23,
    title: "Astro Chat · the additive-migration cutover pattern",
    tier: "production",
    packages: ["identity", "banking", "gde-tad", "whatsapp"],
    summary:
      "Production chat (Astro Chat at astro.ar) cutting over from raw @anthropic-ai/sdk to @ar-agents/* via an additive route (/api/arg) instead of rewriting the legacy /api/chat. Risk-asymmetric, reversible, observable. The exact pattern any production-already-shipped operator should follow when adopting the toolkit without a stop-the-world rewrite.",
    highlight:
      "Live on naza00000/astro/feat/ar-agents-cutover. Full merge readiness review in docs/launch/astro-cutover-merge-readiness.md.",
  },
  {
    id: "24-sociedad-ia-disaster-recovery",
    num: 24,
    title: "Sociedad automatizada disaster recovery · export + restore preserving the audit timeline",
    tier: "production",
    packages: ["incorporate"],
    summary:
      "Nightly export of a sociedad's configuration to portable JSON (no secrets, those stay in your secrets manager). When disaster hits (Vercel project deleted, repo locked, laptop dies), feed the export to a fresh /api/auto-incorporate call with the SAME sessionId, the forensic audit timeline continues unbroken across the disaster. Regulators see one chain of events, not two.",
    highlight:
      "sessionId continuity is the load-bearing piece. The export references env-var names (not values), so recovery is config-portable without secret leakage.",
  },
  {
    id: "25-sociedad-ia-quarterly-compliance",
    num: 25,
    title: "Quarterly compliance report · the answer to a regulator request, generated from the audit log alone",
    tier: "production",
    packages: ["incorporate"],
    summary:
      "Pure function that takes a list of sessionIds + a sociedad metadata block and produces a single self-contained JSON report: per-session timelines + HMAC-verification results + cross-session aggregates + anomalies (clock-skew, governance-shifts, errored LLM calls, missing-HMAC) + a self-disclosure conclusion (clean / anomalies-noted / tampering-detected) + remediation list. Optionally HMAC-signs the report itself for tamper-evidence. Bundles RFC-004 § 9's four mandatory artifacts into one document.",
    highlight:
      "The operational narrative a regulator can demand without a court order, generated from the log not from the operator's recollection. Companion to RFC-004 § 9 + /auditor.",
  },
  {
    id: "26-certify-by-fetch",
    num: 26,
    title: "Certify any sociedad automatizada by fetching its public endpoints",
    tier: "production",
    packages: ["incorporate"],
    summary:
      "Reusable TypeScript function that takes a target base URL, runs ~9 checks against its public endpoints (well-known, audit-read, audit-verify, CSV, OpenAPI, security headers), and returns a 0-100 conformance score + per-check breakdown. Same function backs the /certifier web flow + the /api/certifier HTTP endpoint. Pure fetch, runs in Edge / Node / browser / deno. Includes a CLI mode that exits non-zero if score < 60, drop into CI as a pre-merge gate.",
    highlight:
      "Anyone can verify any sociedad automatizada's claims from one HTTP call. No install, no setup. Lives behind /certifier (web) + /api/certifier (programmatic).",
  },
  {
    id: "27-live-conformance-monitoring",
    num: 27,
    title: "Live conformance monitoring · 90-day time-series + threshold alerts",
    tier: "production",
    packages: ["incorporate"],
    summary:
      "Pure monitor loop that POSTs to /api/conformance-history every N minutes to append a new cert-score for a URL, then compares the latest against a sliding-window baseline (default: median of last 24 points). If the new score drops > threshold (default 10%), fires an alert via Slack/webhook. KV-backed 365-entry capped time-series with 90-day TTL. Idempotent. Drop into Vercel cron, GitHub Actions schedule, or any scheduler. Exits non-zero on alert for CI integration.",
    highlight:
      "Conformance isn't a snapshot, it's a horizon. Recipe 27 turns the certifier into a continuous monitor with drift detection + alerting. Companion to recipe 25 (compliance report) + the /audit-explorer page.",
  },
  {
    id: "28-operator-onboarding-checklist",
    num: 28,
    title: "Operator onboarding checklist · pre-launch readiness verifier",
    tier: "production",
    packages: ["incorporate"],
    summary:
      "Pure function `checkOperatorReadiness(baseUrl)` that walks 10 pre-launch items (discovery manifest, audit endpoints, CSV export, RFC-005 keys, OpenAPI spec, HSTS headers, sitemap, /llms.txt) and returns a per-item pass/fail/skip with remediation links. Reads as the readiness report the operator's pre-launch sign-off. Aggregate readiness rating: ready / almost / blocked. CLI mode exits non-zero on blocked.",
    highlight:
      "Different from recipe 26 (RFC conformance, public), recipe 28 is operator-internal pre-launch sign-off. Used by /api/auto-incorporate to validate freshly-deployed sociedades before adding to /registro.",
  },
  {
    id: "29-publish-your-keys",
    num: 29,
    title: "Publish your sociedad automatizada's Ed25519 public key (RFC-005 § 4)",
    tier: "production",
    packages: ["incorporate"],
    summary:
      "Generate an Ed25519 keypair via Web Crypto, format the public key as SPKI base64url (RFC-005 § 4 wire format), and print: (1) the public-keys JSON to drop into public/.well-known/sociedad-ia/keys.json, (2) the private key as PKCS8 base64url to paste into the operator's secrets manager (Vercel env, 1Password, AWS SM). Same keyId can stay valid; rotation is additive.",
    highlight:
      "The one-time bootstrap for opting into the RFC-005 asymmetric path. Subsequent appendAudit calls automatically include both `hmac` (v1) and `signature` (v2) entries when AUDIT_ED25519_PRIVATE_KEY is set.",
  },
  {
    id: "30-submit-to-registry",
    num: 30,
    title: "Submit your sociedad automatizada to the public /registro",
    tier: "production",
    packages: ["incorporate"],
    summary:
      "Pre-flight check + PR-body generator. Runs recipe 28 (operator readiness) + recipe 26 (RFC certifier) against your URL, validates honesty heuristics (CUIT format, demo-vs-productive disclosure language, type matches behavior), and if everything passes, prints a copy-paste Markdown PR body for the registry submission. Refuses to produce a PR body if any check fails, prevents over-eager submission of half-built sociedades.",
    highlight:
      "Closes the loop from incorporated → conformant → certified → publicly listed. With recipe 30, the full operator lifecycle from `vercel deploy` to listing in /registro is scripted + repeatable.",
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
      eyebrow="cookbook · 2026-05"
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

# set env vars (MP token, AFIP cert, etc, see each recipe's header)
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
        with the use case and the API surface you wish existed, most new
        recipes start as a one-paragraph issue.
      </DocP>
      <ExamplesJsonLd
        recipes={RECIPES.map((r) => ({
          id: r.id,
          num: r.num,
          title: r.title,
          summary: r.summary,
        }))}
      />
    </DocShell>
  );
}
