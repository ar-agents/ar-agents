import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { SecurityJsonLd } from "../json-ld";

export const metadata: Metadata = {
  title: "Security threat model",
  description:
    "Explicit threat model for the @ar-agents/* stack: 14 attack surfaces, 14 mitigations, what's covered, what's outside scope.",
  alternates: { canonical: "https://ar-agents.ar/security" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type ThreatRow = {
  id: string;
  threat: string;
  mitigation: string;
  status: "in-toolkit" | "host-responsibility" | "out-of-scope";
};

const THREATS: ThreatRow[] = [
  {
    id: "T1",
    threat:
      "LLM agent retries a tool call after a network blip, double-charges the customer.",
    mitigation:
      "Deterministic SHA-256 idempotency keys derived from input parameters in 4 mutating tools (create_payment, create_subscription, create_payment_preference, refund_payment). Same inputs → same key → MP server-side dedupes.",
    status: "in-toolkit",
  },
  {
    id: "T2",
    threat:
      "Compromised LLM (jailbreak / prompt injection) authorizes a refund, cancellation, or card deletion the user didn't consent to.",
    mitigation:
      "8 irreversible tools (refund_payment, cancel_subscription, cancel_payment_preference, pause_subscription, delete_customer_card, cancel_qr_dynamic, delete_pos, revoke_marketplace_token) require a `requireConfirmation` callback. Tool execution blocks until the host confirms via UI / Slack / email. Programmatic gate, not LLM instruction.",
    status: "in-toolkit",
  },
  {
    id: "T3",
    threat:
      "Webhook spoofing, attacker crafts fake MP webhooks to mark fake payments as completed.",
    mitigation:
      "verifyWebhookSignature() does HMAC-SHA256 over (id, request-id, ts) with the shared secret. Constant-time comparison defangs timing attacks. 5-minute replay-tolerance window rejects old signed payloads.",
    status: "in-toolkit",
  },
  {
    id: "T4",
    threat:
      "Webhook replay, attacker re-plays a legitimately-signed webhook to trigger duplicate downstream actions.",
    mitigation:
      "WebhookDedup helper short-circuits duplicate webhook IDs server-side. Configurable TTL window (default 24h). Persisted via the same KV adapter the rest of the toolkit uses.",
    status: "in-toolkit",
  },
  {
    id: "T5",
    threat:
      "Access token leak, MP/AFIP/Meta credentials end up in client-side JS bundles.",
    mitigation:
      "MercadoPagoClient and WsfeClient throw at construction time when instantiated in a browser context (typeof window !== 'undefined' check). README warns 'use Server Components / Route Handlers / Server Actions only'. server-only side enforced; the agent loop runs on Edge or Node.",
    status: "in-toolkit",
  },
  {
    id: "T6",
    threat:
      "AFIP cert exfiltration, private key in env vars ends up in logs / source maps / serverless cold-start traces.",
    mitigation:
      "Cert + key passed as PEM strings via env vars (Vercel secrets / AWS Secrets Manager / GCP Secret Manager). Never written to disk. The toolkit reads them once at boot, holds in memory, signs WSAA tokens with Web Crypto. RFC-001 § 3.2 mandates HSM/KMS for sociedades-IA in production.",
    status: "host-responsibility",
  },
  {
    id: "T7",
    threat:
      "Supply-chain attack, malicious code injected into a published @ar-agents/* tarball.",
    mitigation:
      "Every published tarball ships an SLSA v1 npm provenance attestation tying it to a specific GitHub commit + GitHub Actions runner. Verifiable via `npm view <pkg> dist.attestations` against Sigstore transparency log. OpenSSF Scorecard auto-audits 18 supply-chain practices weekly.",
    status: "in-toolkit",
  },
  {
    id: "T8",
    threat:
      "Dependency confusion, attacker publishes a typo-squat (`@ar-agent/mercadopago`).",
    mitigation:
      "Scoped npm org `@ar-agents` registered + locked to one publisher. Verified package metadata (homepage, repository, bugs.url) on every package. README badges + Glama listing + MCP Registry listing all cross-link to https://github.com/ar-agents/ar-agents.",
    status: "in-toolkit",
  },
  {
    id: "T9",
    threat:
      "Hung agent / runaway loop, agent gets stuck retrying a failed tool call until quotas exhaust.",
    mitigation:
      "stopWhen: stepCountIs(N) caps agent steps. CircuitBreaker on every external API client (rolling-window failure threshold). Per-request timeout via AbortSignal propagation. MaxRetries default = 1 for state mutations, 3 for read-only lookups.",
    status: "in-toolkit",
  },
  {
    id: "T10",
    threat:
      "Cross-tenant data leak, multi-tenant host fetches Tenant A's MP payments and Tenant B sees them.",
    mitigation:
      "Each MercadoPagoClient instance is bound to one accessToken. State adapters keyed on a host-supplied tenantId. The toolkit doesn't share state across instances, host wires per-tenant adapters.",
    status: "host-responsibility",
  },
  {
    id: "T11",
    threat:
      "Audit log tampering, attacker who breached the host modifies past tool-call records to cover their tracks.",
    mitigation:
      "AuditLogger wraps every tool call (input, output, duration, error) with an HMAC-signed timestamp using a separate audit secret. Append-only sink (Vercel KV, S3 with object lock, Postgres with row-level immutability). RFC-001 § 9.2 makes the log legally probative.",
    status: "in-toolkit",
  },
  {
    id: "T12",
    threat:
      "OAuth token theft, marketplace seller's MP refresh-token leaked, attacker drains their account.",
    mitigation:
      "VercelKVOAuthTokenStore (subpath `/vercel-kv`) encrypts at rest, scoped to your platform's Vercel project. Refresh tokens kept server-side. The toolkit's revoke_marketplace_token tool gated behind requireConfirmation (T2).",
    status: "in-toolkit",
  },
  {
    id: "T13",
    threat:
      "Content injection in factura PDF (XSS via item description, or embedded executable).",
    mitigation:
      "Item descriptions sanitized + length-capped before WSFE submit. AFIP's WSFE rejects malformed payloads server-side. PDF generation uses static templates with parameter binding, no user-supplied HTML/JS injection vector.",
    status: "in-toolkit",
  },
  {
    id: "T14",
    threat:
      "Browser-fingerprint MP fraud detection bypass, attacker scripts payment flow to look like legitimate browser traffic.",
    mitigation:
      "Out of scope. MP's fraud team runs the detection; the toolkit's job is to surface their verdict via explainPaymentStatus(). Recipe 13 (anti-fraud middleware) layers additional pre-charge heuristics (CUIT validity, payer history, velocity, BCRA cross-check).",
    status: "out-of-scope",
  },
];

const STATUS_LABEL: Record<ThreatRow["status"], string> = {
  "in-toolkit": "Mitigated by toolkit",
  "host-responsibility": "Host is responsible",
  "out-of-scope": "Out of scope",
};

const STATUS_COLOR: Record<ThreatRow["status"], string> = {
  "in-toolkit": "var(--green, #22c55e)",
  "host-responsibility": "var(--yellow, #eab308)",
  "out-of-scope": "var(--text-muted)",
};

export default function SecurityPage() {
  return (
    <DocShell
      eyebrow="security · threat model"
      title="Security threat model."
      subtitle="14 explicit threats, 14 explicit mitigations. What the toolkit covers, what the host is responsible for, what's out of scope. Updated for every release."
    >
      <DocBlock>
        <DocP>
          When agents move money, the threat surface widens. An LLM that can
          authorize a charge can also be coerced (via prompt injection,
          jailbreak, or compromised upstream model) into authorizing a
          fraudulent one. The toolkit&apos;s job is to make those attacks
          mechanically harder to execute, not just hope the model never
          gets confused.
        </DocP>
        <DocP>
          This page enumerates every threat we have explicitly thought
          about, with the specific mitigation in code. Inspired by
          STRIDE + the OWASP LLM Top 10. Three statuses:
        </DocP>
        <DocP>
          <strong>Mitigated by toolkit</strong>, code in @ar-agents/*
          eliminates or substantially raises the bar for the attack.{" "}
          <strong>Host is responsible</strong>, the toolkit gives you
          the primitives but you have to wire them correctly (e.g.,
          using HSM/KMS for cert storage). <strong>Out of scope</strong>:{" "}
        the attack lives outside the boundary the toolkit can
          reasonably defend.
        </DocP>
      </DocBlock>

      <DocH2>The 14 threats</DocH2>

      <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
        {THREATS.map((t) => (
          <article
            key={t.id}
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
                gap: 12,
                alignItems: "baseline",
                marginBottom: 8,
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
                {t.id}
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
            </div>
            <div
              style={{
                fontSize: 15,
                color: "var(--text)",
                marginBottom: 10,
                lineHeight: 1.5,
                fontWeight: 500,
              }}
            >
              {t.threat}
            </div>
            <div
              style={{
                fontSize: 14,
                color: "var(--text-body)",
                lineHeight: 1.6,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginRight: 6,
                }}
              >
                MITIGATION
              </span>
              {t.mitigation}
            </div>
          </article>
        ))}
      </div>

      <DocH2>Reporting a vulnerability</DocH2>
      <DocP>
        If you find a security issue not covered above, please don&apos;t
        open a public GitHub issue. Email{" "}
        <a href="mailto:naza@naza.ar" style={{ color: "var(--accent)" }}>
          naza@naza.ar
        </a>{" "}
        with details and proof-of-concept. We&apos;ll respond within 48
        hours and disclose responsibly per <DocCode>SECURITY.md</DocCode>{" "}
        in the repo.
      </DocP>
      <DocP>
        For supply-chain audit: every published package ships SLSA v1
        provenance attestations. Verify with{" "}
        <DocCode>npm view @ar-agents/&lt;name&gt; dist.attestations</DocCode>{" "}
        and cross-check the Sigstore transparency-log entry.
      </DocP>

      <DocH2>What this page is, and isn&apos;t</DocH2>
      <DocP>
        <strong>This page IS</strong> the toolkit author&apos;s explicit
        thinking about the attack surface. Every claim maps to specific
        code. If a mitigation breaks, this page is wrong and we update it
        in the same PR.
      </DocP>
      <DocP>
        <strong>This page IS NOT</strong> a third-party audit, a SOC 2
        report, or a guarantee. The toolkit is MIT-licensed open source;
        you operate it under your own legal &amp; compliance regime. For
        regulated workloads (banking, healthcare, government), commission
        a third-party review before production deployment.
      </DocP>
      <SecurityJsonLd />
    </DocShell>
  );
}
