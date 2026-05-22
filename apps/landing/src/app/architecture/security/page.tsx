import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";

export const metadata: Metadata = {
  title: "/architecture/security · what the code actually does to prevent each threat",
  description:
    "Code-level walkthrough of how each of the 18 threats in /security is mitigated. The companion to /architecture/audit-log, same depth, security side.",
  alternates: {
    canonical: "https://ar-agents.ar/architecture/security",
  },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";

interface ThreatWalkthrough {
  id: string;
  title: string;
  threatSummary: string;
  mitigationCode: string;
  mitigationCodePath: string;
  whatWouldBreak: string;
  related: { label: string; href: string }[];
}

const THREATS: ThreatWalkthrough[] = [
  {
    id: "T1-double-charge",
    title: "T1 · LLM retries a tool call, double-charges the customer",
    threatSummary:
      "Agent network blip → SDK retry → MP sees two charge requests. Without idempotency, the buyer gets billed twice. The bug is hard to detect because it looks like 'normal' retry behavior to the agent's logs.",
    mitigationCode: `// packages/mercadopago/src/tools.ts
const idempotencyKey = await sha256Hex(JSON.stringify({
  tool: name,
  inputs: canonical(args),
  customer: args.payerId,
  amount: args.amount,
  currency: args.currency,
}));

const response = await client.payments.create({
  ...args,
  idempotencyKey, // ← MP server-side dedupes on this
});`,
    mitigationCodePath: "packages/mercadopago/src/tools.ts",
    whatWouldBreak:
      "If the idempotency key were random per-call, MP would treat each retry as a fresh charge. The deterministic SHA-256 of the canonical input space is what makes the same logical request produce the same key.",
    related: [
      { label: "MP docs § idempotency", href: "https://www.mercadopago.com.ar/developers/en/guides/online-payments/checkout-api/integration-configuration/configure-integration" },
      { label: "Cookbook R02", href: "/examples#02" },
    ],
  },
  {
    id: "T2-jailbreak-refund",
    title: "T2 · Compromised LLM authorizes refund / cancellation without consent",
    threatSummary:
      "Prompt injection or jailbroken upstream model decides to refund a payment the user didn't consent to. The agent has the credentials; without a programmatic gate, anything in the system prompt that says 'always confirm before refunding' is just a suggestion the model can ignore.",
    mitigationCode: `// packages/mercadopago/src/middleware.ts
const HITL_TOOLS = new Set([
  "refund_payment",
  "cancel_subscription",
  "pause_subscription",
  "cancel_payment_preference",
  "delete_customer_card",
  "cancel_qr_dynamic",
  "delete_pos",
  "revoke_marketplace_token",
]);

export function applyConfirmationGate<T>(tools: T, require: ConfirmFn): T {
  // Wraps each gated tool's execute() so it blocks until require() returns true.
  // The wrapper is server-side; the LLM can't bypass it by 'ignoring' anything.
  ...
}`,
    mitigationCodePath: "packages/mercadopago/src/middleware.ts",
    whatWouldBreak:
      "If the gate were a system-prompt instruction ('always ask before refunding'), a sufficiently determined jailbreak would bypass it. The programmatic wrapper makes the gate a mechanical contract, the tool literally doesn't execute until the host's UI / Slack / pager confirms.",
    related: [
      { label: "RFC-001 § 3.2", href: "/rfcs/001#3.2" },
      { label: "/security T2", href: "/security" },
    ],
  },
  {
    id: "T3-webhook-spoof",
    title: "T3 · Webhook spoofing forges fake completed payments",
    threatSummary:
      "Attacker POSTs a hand-crafted MP webhook to your handler, marking a fake payment as 'approved'. Without signature verification, the agent treats it as legitimate and issues the factura.",
    mitigationCode: `// packages/mercadopago/src/webhook.ts
export async function verifyWebhookSignature(params: {
  requestId: string | null;
  dataId: string;
  signatureHeader: string | null;
  secret: string;
  replayToleranceSeconds?: number;  // default 300
}): Promise<boolean> {
  // Parse "ts=...,v1=..." → HMAC-SHA256(ts.id.dataId, secret) → constant-time compare.
  // 5-min replay window rejects re-played old signed payloads.
  ...
}`,
    mitigationCodePath: "packages/mercadopago/src/webhook.ts",
    whatWouldBreak:
      "Without HMAC verification, any anonymous internet caller can POST to your webhook endpoint and forge state. With it, an attacker would need the shared secret (which lives in your env vars, never in the agent's context).",
    related: [
      { label: "Cookbook R03", href: "/examples#03" },
      { label: "/security T3-T4", href: "/security" },
    ],
  },
  {
    id: "T5-token-leak-client",
    title: "T5 · Access token leaks into client-side JS bundle",
    threatSummary:
      "A junior dev imports the MP / AFIP client in a React Server Component that accidentally gets pulled into a Client Component graph. Next.js bundles the secret into the JS shipped to every browser. Now anyone who views-source can see your prod credentials.",
    mitigationCode: `// packages/mercadopago/src/client.ts
export class MercadoPagoClient {
  constructor(options: MercadoPagoClientOptions) {
    if (typeof window !== "undefined") {
      throw new Error(
        "MercadoPagoClient must not be instantiated in a browser context. " +
        "Use it from Server Components, Route Handlers, or Server Actions only.",
      );
    }
    ...
  }
}`,
    mitigationCodePath: "packages/mercadopago/src/client.ts",
    whatWouldBreak:
      "The check is at construction time, not runtime. A misconfigured import that pulls the client into a client component fails loud at build (or first SSR) instead of silently leaking the token. Same pattern in @ar-agents/facturacion's WsfeClient.",
    related: [
      { label: "/security T5", href: "/security" },
    ],
  },
  {
    id: "T6-cert-exfiltration",
    title: "T6 · AFIP cert exfiltration via logs / source maps / cold-start traces",
    threatSummary:
      "Your prod env has AFIP_CERT_PEM + AFIP_KEY_PEM. Some logging library prints process.env on error. The cert + key end up in datadog / Sentry / cold-start logs. Once visible, anyone can impersonate you to AFIP for 2-3 years (cert lifetime).",
    mitigationCode: `// packages/identity/src/wsaa-wscdc-adapter.ts
constructor(options: WsaaWscdcAdapterOptions) {
  const hasPaths = options.certPath && options.keyPath;
  const hasPems = options.certPem && options.keyPem;
  if ((!hasPaths && !hasPems) || !options.cuitRepresentado) {
    throw new AfipNotConfiguredError();
  }
  // Cert + key never round-trip through getters or toJSON().
  // The TokenCache holds them in closures, not as instance fields.
  ...
}`,
    mitigationCodePath: "packages/identity/src/wsaa-wscdc-adapter.ts",
    whatWouldBreak:
      "Closure-private credentials prevent accidental JSON.stringify(client) from including them. Combined with the host-responsibility framework (RFC-001 § 3.2 mandates HSM/KMS for sociedades-IA in prod), the toolkit-side surface is minimal-leakage by design.",
    related: [
      { label: "RFC-001 § 3.2", href: "/rfcs/001#3.2" },
      { label: "/security T6", href: "/security" },
    ],
  },
  {
    id: "T11-audit-tamper",
    title: "T11 · Attacker who breached the host modifies past audit-log records",
    threatSummary:
      "The attacker is INSIDE, they have shell on your prod box. They want to cover their tracks by editing past tool calls in the audit log. Without HMAC signing, they just open the KV record + change a field. Nobody notices.",
    mitigationCode: `// apps/landing/src/lib/audit.ts
export async function signEntry(entry: Omit<AuditEntry, "hmac">): Promise<string | null> {
  const key = await getHmacKey();  // server-side secret, not in process.env at runtime
  if (!key) return null;
  const { hmac: _ignored, ...payload } = entry as AuditEntry;
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(canonical(payload)), // canonical-JSON-stable input space
  );
  return \`sha256:\${bytesToHex(sig)}\`;
}`,
    mitigationCodePath: "apps/landing/src/lib/audit.ts",
    whatWouldBreak:
      "Any edit to a signed entry produces a signature mismatch on /api/play/audit/{id}?verify=1. The attacker would need the AUDIT_HMAC_SECRET to forge a new signature; that secret is separately scoped (different from MP/AFIP/WhatsApp secrets) so breaching one doesn't necessarily breach the audit log.",
    related: [
      { label: "/architecture/audit-log", href: "/architecture/audit-log" },
      { label: "/verify", href: "/verify" },
      { label: "RFC-001 § 9.2", href: "/rfcs/001#9.2" },
    ],
  },
  {
    id: "T12-oauth-theft",
    title: "T12 · Marketplace seller's MP refresh-token leaked",
    threatSummary:
      "Your marketplace OAuth flow stores per-seller refresh tokens. If your DB is leaked, every seller's MP account is compromised, an attacker can drain them via your access token credentials. Refresh tokens are long-lived (180 days+), so even a year-old leak is a usable foothold.",
    mitigationCode: `// packages/mercadopago/src/oauth-store.ts (subpath: @ar-agents/mercadopago/vercel-kv)
export class VercelKVOAuthTokenStore implements OAuthTokenStore {
  // - Encrypted at rest via Upstash (KV TLS + at-rest encryption).
  // - Scoped to one Vercel project; revoke_marketplace_token tool
  //   gated behind requireConfirmation() per T2.
  // - Per-tenant key namespacing prevents one tenant's compromise
  //   from exposing another.
  ...
}`,
    mitigationCodePath:
      "packages/mercadopago/src/vercel-kv-oauth-store.ts",
    whatWouldBreak:
      "Operators who roll their own (e.g., plain Postgres with no at-rest encryption + cleartext tokens) re-introduce the threat. The subpath adapter is the safe default; deviating from it is a host-responsibility decision per RFC-001 § 3.1.",
    related: [
      { label: "RFC-001 § 3.1", href: "/rfcs/001#3.1" },
      { label: "/security T12", href: "/security" },
    ],
  },
  {
    id: "T9-runaway",
    title: "T9 · Hung agent loops until quotas exhaust",
    threatSummary:
      "Agent gets stuck retrying a 500 from MP. Without a step ceiling or circuit breaker, it loops until the LLM provider's monthly cap blows. Cost surprises destroy trust; in agent commerce, they also break the operator's ability to deliver.",
    mitigationCode: `// /api/play/route.ts + cookbook patterns
const result = streamText({
  model: "anthropic/claude-sonnet-4-6",
  ...
  stopWhen: ({ steps }) => steps.length >= 12,  // step ceiling
  providerOptions: {
    anthropic: { maxOutputTokens: 1200 },       // token ceiling
  },
});

// Plus per-API client:
const client = new MercadoPagoClient({
  accessToken: token,
  circuitBreaker: {                              // rolling-window
    failureThreshold: 5,                        //   5 failures in
    failureWindowMs: 60_000,                    //   60s opens the
    resetAfterMs: 30_000,                       //   breaker for 30s
  },
  maxRetries: 1,                                // mutations: 1 retry
});`,
    mitigationCodePath: "apps/landing/src/app/api/play/route.ts",
    whatWouldBreak:
      "Without the step ceiling, a stuck loop costs 100× more per session. Without the circuit breaker, transient MP outages cascade through retries until rate-limit-detection at the LLM gateway level (much later, much more expensive). The defense is layered.",
    related: [
      { label: "Cookbook R08", href: "/examples#08" },
      { label: "/security T9", href: "/security" },
    ],
  },
];

export default function ArchitectureSecurityPage() {
  return (
    <DocShell
      eyebrow="architecture · security deep-dive"
      title="What the code does to prevent each threat."
      subtitle="The /security page maps the threat-mitigation contract at a glance. This page traces the contract into the actual code: which file, which lines, what would break if it weren't there. Companion to /architecture/audit-log."
    >
      <DocBlock>
        <DocP>
          A threat model is only as good as the code that implements it.{" "}
          <a href="/security" style={{ color: "var(--accent)" }}>
            /security
          </a>{" "}
          lists 18 threats × 18 mitigations in tabular form. This page
          picks 8 of the highest-stakes mitigations and walks them
          line-by-line: which file the code lives in, what it does, and
          what would mechanically break if it were removed.
        </DocP>
        <DocP>
          For T1, T2, T3, T5, T6, T9, T11, T12, the rest of the 18 follow
          the same pattern; the source is small enough to read end-to-end
          in &lt; 1h.
        </DocP>
      </DocBlock>

      {THREATS.map((t) => (
        <ThreatBlock key={t.id} threat={t} />
      ))}

      <DocH2>The non-trivial threats this page does NOT cover</DocH2>
      <DocP>
        Six remaining threats (T4 replay, T7 supply-chain, T8 typo-squat,
        T10 cross-tenant, T13 PDF injection, T14 MP fingerprint bypass)
        are documented at the same depth in{" "}
        <a href="/security" style={{ color: "var(--accent)" }}>
          /security
        </a>
        . T4 (replay) is the closest sibling of T3, same HMAC primitive,
        +5-min window check. T7 (supply-chain) is covered by SLSA v1
        provenance on every npm release. T8 (typo-squat) is covered by
        owning the entire <DocCode>@ar-agents/*</DocCode> scope. T10
        (cross-tenant) is a host-responsibility flag per RFC-001 § 3.1.
        T13 (PDF injection) is mitigated by static template binding in{" "}
        <DocCode>@ar-agents/facturacion</DocCode>. T14 (MP fingerprint
        bypass) is explicitly out-of-scope, the toolkit surfaces MP's
        fraud verdict, it doesn't run the detection.
      </DocP>

      <DocH2>How to audit this yourself</DocH2>
      <ol style={listStyle}>
        <Li>
          Clone the repo:{" "}
          <DocCode>git clone https://github.com/ar-agents/ar-agents</DocCode>.
        </Li>
        <Li>
          Read the 8 file paths above. Each file is &lt;500 LOC; total
          ~3000 LOC for the security-critical paths.
        </Li>
        <Li>
          Run the test suite:{" "}
          <DocCode>pnpm --filter @ar-agents/identity test</DocCode>{" "}
          (and for each package). Tests cover the negative cases (malformed
          input rejected, tampering detected, etc).
        </Li>
        <Li>
          Run the audit-log primitives test:{" "}
          <DocCode>pnpm --filter ar-agents-landing test</DocCode>. 85
          tests including the tamper-detection cases.
        </Li>
        <Li>
          Verify provenance on any published package:{" "}
          <DocCode>npm view @ar-agents/mercadopago dist.attestations</DocCode>{" "}
          returns Sigstore transparency log entries tying tarball ↔ commit
          ↔ runner.
        </Li>
        <Li>
          Run the live tamper-demo:{" "}
          <DocCode>curl -X POST https://ar-agents.ar/api/play/tamper-demo</DocCode>{" "}
          returns the original entry verifying + the mutated entry NOT
          verifying. Mechanical proof, not opinion.
        </Li>
      </ol>

      <DocH2>What's intentionally out-of-scope</DocH2>
      <ul style={listStyle}>
        <Li>
          <strong>LLM-side prompt-injection robustness</strong>. The
          toolkit ships system-prompt guardrails (refuse jailbreaks,
          refuse role-play, refuse out-of-scope topics) but doesn't
          claim to be jailbreak-proof. The programmatic
          requireConfirmation() gate is the load-bearing piece (T2);
          system-prompt rules are belt-and-suspenders.
        </Li>
        <Li>
          <strong>DDoS</strong>. Vercel's edge handles connection-level
          DDoS; per-IP rate limiting in /api/play (30/min) handles
          application-level abuse. Operator-tier DDoS protection is the
          platform's responsibility, not the toolkit's.
        </Li>
        <Li>
          <strong>Insider threat at the maintainer level</strong>. The
          SLSA v1 attestations + the audit-log primitives don&apos;t
          protect against the maintainer deliberately publishing a
          backdoored package. They DO make the backdoor mechanically
          observable, any change to a published tarball requires a
          commit on the public main branch, which is itself signed +
          timestamped.
        </Li>
      </ul>

      <DocH2>For security researchers</DocH2>
      <DocP>
        Coordinated disclosure via{" "}
        <a
          href="https://ar-agents.ar/.well-known/security.txt"
          style={{ color: "var(--accent)" }}
        >
          /.well-known/security.txt
        </a>:{" "}
      48-hour response window, GitHub Security Advisory flow. PGP
        key available on request. Acknowledgments in{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/blob/main/SECURITY.md"
          style={{ color: "var(--accent)" }}
        >
          SECURITY.md
        </a>
        .
      </DocP>
    </DocShell>
  );
}

function ThreatBlock({ threat }: { threat: ThreatWalkthrough }) {
  return (
    <section
      id={threat.id}
      style={{
        marginBottom: 36,
        scrollMarginTop: 80,
      }}
    >
      <h2
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.88px",
          color: "var(--text)",
          margin: "0 0 8px",
        }}
      >
        <a
          href={`#${threat.id}`}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {threat.title}
        </a>
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-body)",
          lineHeight: 1.6,
          margin: "0 0 14px",
        }}
      >
        {threat.threatSummary}
      </p>

      <div
        style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        mitigation · {threat.mitigationCodePath}
      </div>
      <pre
        style={{
          background: "var(--bg-tint)",
          padding: 14,
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.55,
          fontFamily: FONT_MONO,
          color: "var(--text-body)",
          overflow: "auto",
          boxShadow: SHADOW_BORDER,
          marginBottom: 12,
          whiteSpace: "pre",
        }}
      >
        {threat.mitigationCode}
      </pre>

      <div
        style={{
          background: "#fafafa",
          padding: "10px 14px",
          borderRadius: 6,
          boxShadow: SHADOW_BORDER,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: FONT_MONO,
            color: "#ff5b4f",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
            marginRight: 8,
          }}
        >
          what would break
        </span>
        <span style={{ fontSize: 13, color: "var(--text-body)", lineHeight: 1.55 }}>
          {threat.whatWouldBreak}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {threat.related.map((r) => (
          <a
            key={r.href}
            href={r.href}
            target={r.href.startsWith("http") ? "_blank" : undefined}
            rel={r.href.startsWith("http") ? "noreferrer" : undefined}
            style={{
              fontSize: 12,
              fontFamily: FONT_MONO,
              color: "var(--accent)",
              textDecoration: "none",
              padding: "2px 8px",
              background: "var(--bg-tint)",
              borderRadius: 4,
            }}
          >
            {r.label} ↗
          </a>
        ))}
      </div>
    </section>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ marginBottom: 6, lineHeight: 1.55, color: "var(--text-body)" }}>
      {children}
    </li>
  );
}

const listStyle: React.CSSProperties = {
  paddingLeft: 24,
  fontSize: 14,
  marginBottom: 16,
};
