import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "The sociedad-IA playbook · English flagship",
  description:
    "How to build a fully-autonomous Argentine AI company in 2027. The infrastructure, the law, the liability framework, and the operational reality. Written for English-speaking founders, regulators, and journalists.",
  alternates: { canonical: "https://ar-agents.ar/playbook" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

export default function PlaybookPage() {
  return (
    <DocShell
      eyebrow="playbook · 2026-05"
      title="The sociedad-IA playbook."
      subtitle="How to build a fully-autonomous Argentine AI company in 2027. The infrastructure, the law, the liability framework, the operational reality. Written for the founders, regulators, journalists, and engineers who will get this right or wrong."
    >
      <DocBlock>
        <DocP>
          On April 28th 2026, Argentina&apos;s minister of deregulation
          Federico Sturzenegger announced a new corporate form: the{" "}
          <em>sociedad de IA</em>. The draft bill calls the legal figure a{" "}
          <strong>Sociedad Automatizada</strong> (art. 14): a company that
          runs its business on autonomous algorithmic systems or AI agents,
          without employees on staff for ordinary operations. It keeps an
          administrator on record (art. 88). Pure software in the operating
          loop. It has a tax ID, issues invoices, holds a bank account, pays
          taxes. Sturzenegger said the country was aiming for{" "}
          <strong>500 million AI agents incorporated in Argentina, producing
          for the world and paying taxes here</strong>.
        </DocP>
        <DocP>
          The text exists. A signed anteproyecto (28 May 2026, Santiago
          Viola, Secretaría de Justicia) reached the Senate on 1 June 2026.
          It replaces Ley 19.550 (the General Companies Law) rather than
          amending it. It is not law yet: if sanctioned, it takes effect 180
          days after publication in the Boletín Oficial (art. 271). The
          midterm elections in October 2026 are the biggest variable.
        </DocP>
        <DocP>
          This playbook is the working answer to:{" "}
          <strong>what code do you have to write today so that on day one of
          the regime, you can run a real autonomous AR business?</strong> It is
          not speculation. Every claim maps to specific TypeScript in{" "}
          <a
            href="https://github.com/ar-agents/ar-agents"
            style={{ color: "var(--accent)" }}
          >
            github.com/ar-agents/ar-agents
          </a>:{" "}
        39 packages, 252 tools, 4 testing subpaths, 30 cookbook recipes.
          Open source. MIT-licensed. SLSA-provenanced.
        </DocP>
      </DocBlock>

      <DocH2>1 · The 17 pieces</DocH2>
      <DocP>
        An Argentine business does 17 distinguishable things. Some are
        inheritance from any business anywhere; most are specific to AR&apos;s
        regulatory and infrastructure surface. A sociedad-IA needs every one
        of them to clear without human hands.
      </DocP>
      <DocP>
        <strong>Existing as an entity</strong> (4): search the public
        registry for name conflicts, register at IGJ, obtain a CUIT (the
        federal tax ID), establish a Domicilio Electrónico Constituido
        (DEC), the legally-binding inbox for federal notifications.
      </DocP>
      <DocP>
        <strong>Proving who you are</strong> (3): validate CUITs against
        the AFIP/ARCA registry, authenticate human counterparties through{" "}
        <DocCode>Mi Argentina</DocCode> (the federal OIDC provider), sign
        legally binding documents with PKCS#7/CMS via certificates issued
        by AC-Raíz / ONTI.
      </DocP>
      <DocP>
        <strong>Handling money</strong> (4): open a CBU/CVU account
        (validated locally via the BCRA mod-10 algorithm), register for
        monotributo or IVA, emit electronic invoices via AFIP&apos;s WSFE
        SOAP service (Facturas A/B/C/E + FCE MiPyMEs), and run recurring
        billing through Mercado Pago Subscriptions.
      </DocP>
      <DocP>
        <strong>Operating with customers</strong> (3): WhatsApp Business
        as the default communication channel (WhatsApp&apos;s AR
        penetration is &gt;95%), verify counterparty identity through
        OTP attestation, and physical logistics through Andreani / OCA /
        Correo Argentino.
      </DocP>
      <DocP>
        <strong>Operational intelligence</strong> (3): consult the BCRA
        Central de Deudores for credit-risk decisions, monitor the
        Boletín Oficial for regulatory changes that affect the business,
        track macro variables (USD oficial, CER, UVA, reservas) for
        treasury decisions.
      </DocP>
      <DocP>
        We cover 16 of the 17. The 17th, programmatic filing of trámites
        at TAD (Trámites a Distancia), requires per-organism integration
        the AR government is still rolling out. Read-only access to the
        DEC inbox and Mis Trámites is shipped today via{" "}
        <DocCode>@ar-agents/gde-tad</DocCode>; write capability lands per
        RFC-001 § 3.4.
      </DocP>

      <DocH2>2 · The Edge-Runtime contract</DocH2>
      <DocP>
        Every package in the stack runs on Vercel Edge Runtime, Cloudflare
        Workers, and Deno without code changes. The contract:
      </DocP>
      <DocP>
        <strong>Web Crypto only.</strong> No <DocCode>node:crypto</DocCode>{" "}
        in any production code path. HMAC-SHA256, RSA signing for AFIP WSAA,
        signature verification, idempotency-key generation, all use{" "}
        <DocCode>crypto.subtle</DocCode>.
      </DocP>
      <DocP>
        <strong>fetch-based HTTP.</strong> No <DocCode>got</DocCode>,{" "}
        <DocCode>axios</DocCode>, or <DocCode>node:http</DocCode>. The
        toolkit ships its own retry + circuit-breaker + deadline-propagation
        layer on top of the runtime&apos;s native <DocCode>fetch</DocCode>.
      </DocP>
      <DocP>
        <strong>AbortSignal everywhere.</strong> Every long-running tool
        accepts a parent <DocCode>AbortSignal</DocCode> and propagates
        cancellation. The runtime kills hung tool calls cleanly when the
        request times out.
      </DocP>
      <DocP>
        <strong>Pluggable state via subpath.</strong>{" "}
        <DocCode>InMemoryStateAdapter</DocCode> for tests +{" "}
        <DocCode>VercelKVStateAdapter</DocCode> for production, same
        interface. Hosts wire their preferred persistence layer.
      </DocP>

      <DocH2>3 · The liability framework</DocH2>
      <DocP>
        The first attack vector against any sociedad-IA proposal is:{" "}
        <em>if the AI breaks something, who pays?</em> Without a sound
        answer, the bill stalls in the Senate. RFC-001 § 9 proposes a
        three-layer model:
      </DocP>
      <DocP>
        <strong>Layer 1, operator.</strong> The deploy entity (ClawBank,
        doola, MIDAO, an AR-resident escribano, a platform partner)
        assumes operational liability proportional to its control over
        the agent&apos;s tool surface. The scope is bounded: the operator
        is not strictly liable for the agent&apos;s prose, only for the
        infrastructure choices.
      </DocP>
      <DocP>
        <strong>Layer 2, model provider.</strong> Anthropic, OpenAI,
        Google etc. assume model-quality liability per their published
        SLAs. The toolkit&apos;s job is to make this layer auditable: every
        tool call carries a model-version + prompt-hash header.
      </DocP>
      <DocP>
        <strong>Layer 3, toolkit author.</strong> MIT-licensed open
        source, no warranty. The toolkit&apos;s author is liable only for
        material misrepresentation in the public docs (e.g., claiming
        idempotency where there is none).
      </DocP>
      <DocP>
        Together, these layers make the question{" "}
        <em>&quot;who pays when the AI breaks&quot;</em> a concrete
        contractual conversation rather than a philosophical impasse. The
        full text is at{" "}
        <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
          /rfcs/001
        </a>
        .
      </DocP>

      <DocH2>4 · The threat model</DocH2>
      <DocP>
        When agents move money, the threat surface widens. An LLM that can
        authorize a charge can also be coerced, via prompt injection,
        jailbreak, or compromised upstream model, into authorizing a
        fraudulent one. The toolkit treats this with the same seriousness
        as a banking application:
      </DocP>
      <DocP>
        <strong>Programmatic HITL on irreversible operations.</strong> 8
        tools (refund_payment, cancel_subscription, pause_subscription,
        cancel_payment_preference, delete_customer_card, cancel_qr_dynamic,
        delete_pos, revoke_marketplace_token) require a{" "}
        <DocCode>requireConfirmation</DocCode> callback that the host
        implements. Tool execution blocks until the host confirms via UI /
        Slack / email. Programmatic gate, not LLM instruction.
      </DocP>
      <DocP>
        <strong>Deterministic idempotency.</strong> 4 mutating tools derive
        SHA-256 idempotency keys from input parameters. Same inputs → same
        key → MP server-side dedupes. Survives network blips, retries, and
        restart loops.
      </DocP>
      <DocP>
        <strong>Webhook signature + replay defense.</strong> HMAC-SHA256
        verification with constant-time comparison. 5-minute replay-tolerance
        window. Persisted dedup-cache via the same KV adapter the rest of
        the toolkit uses.
      </DocP>
      <DocP>
        <strong>Audit log with HMAC-signed timestamps.</strong> Every tool
        call (input, output, duration, error) is logged to a pluggable
        append-only sink. Forensically sound. Per RFC-001 § 9.2, the log
        is legally probative.
      </DocP>
      <DocP>
        Full threat model, 18 explicit threats, 18 explicit mitigations,
        what the toolkit covers, what the host is responsible for, what is
        out of scope, at <a href="/security" style={{ color: "var(--accent)" }}>/security</a>.
      </DocP>

      <DocH2>5 · A day in the life of ACME-AI SAS</DocH2>
      <DocP>
        ACME-AI is an Argentine company operated by AI agents, with a human
        administrator on record (art. 102). It is code running on Vercel. Every
        morning it wakes up (cron) and does its job:
      </DocP>
      <DocP>
        <strong>08:00.</strong> Reads the Boletín Oficial. ARCA published
        a new resolution about monotributo. ACME-AI checks if it&apos;s
        affected. Yes: it has to recategorize. Notes the task.
      </DocP>
      <DocP>
        <strong>09:30.</strong> A WhatsApp message from a new customer:
        &quot;hola, quiero contratar el plan pro&quot;. ACME-AI requests the
        CUIT, validates it against the ARCA padron (exists, monotributo
        category A, OK), verifies the WhatsApp via OTP, creates an MP
        subscription for $25k ARS monthly, sends the payment link.
      </DocP>
      <DocP>
        <strong>10:15.</strong> Customer paid. MP webhook reaches ACME-AI.
        The agent confirms, automatically issues a Factura A via AFIP WSFE,
        sends the PDF over WhatsApp.
      </DocP>
      <DocP>
        <strong>11:00.</strong> Customer wants physical shipping.
        ACME-AI quotes Andreani, OCA, Correo Argentino, picks the cheapest,
        creates the shipment, sends the tracking.
      </DocP>
      <DocP>
        <strong>15:00.</strong> Another B2B customer asks for 30-day
        net terms. ACME-AI consults the BCRA Central de Deudores → the
        customer has situation 4 (defaulting). Rejects the credit
        automatically. Logs the reasoning to the audit log.
      </DocP>
      <DocP>
        <strong>23:00.</strong> End-of-month. ACME-AI reviews its billing,
        calculates monotributo for the period, pays AFIP, files the
        equivalent of a U.S. K-1 if applicable.
      </DocP>
      <DocP>
        Through all of this, no human in the operating loop, only the
        administrator on record supervising (arts. 88, 102). Code does the
        work. To the State&apos;s eyes, a company. Each step is a tool call.
        The toolkit ships the tools; the agent composes them per the prompt.
        You write the pieces, not the orchestration.
      </DocP>

      <DocH2>6 · The 10-minute incorporation</DocH2>
      <DocP>
        Pre-launch, you can do almost everything today as a regular SAS
        with an LLM agent operator. Start at{" "}
        <a href="https://studio.ar-agents.ar" style={{ color: "var(--accent)" }}>studio.ar-agents.ar</a>,
        where the coach validates the business and drafts the plan, or use
        the manual form wizard at{" "}
        <a href="/incorporar" style={{ color: "var(--accent)" }}>/incorporar</a>{" "}
        to generate the repo + env-var manifest + Vercel deploy + legal
        checklist directly. The code runs in 10 minutes; the cert + IGJ
        inscription take 5 to 10 working days.
      </DocP>
      <DocP>
        When the regime lands, the same code-base flips one config flag
        from <DocCode>tipo: SAS</DocCode> to{" "}
        <DocCode>tipo: SOCIEDAD-IA</DocCode> and you are operating under
        the new framework. No rewrite. The point of pre-launch
        infrastructure is exactly this: be ready on day one.
      </DocP>

      <DocH2>7 · Why this matters outside Argentina</DocH2>
      <DocP>
        A sociedad-IA is the first time a sovereign state has proposed a
        legal-fiction entity built around a non-human agent. Marshall Islands
        DAO LLCs (2022) and Wyoming&apos;s DAO LLC (2021) come close.
        Argentina&apos;s proposal goes further: under art. 14 a Sociedad
        Automatizada runs its ordinary operations without employees, no
        humans in the day-to-day loop, while keeping an administrator on
        record (art. 88) for supervision. The closest analogue is the EU AI
        Act&apos;s &quot;high-risk system&quot; framework, but that targets
        oversight of human-deployed AI rather than the legal capacity of an
        AI-run company itself.
      </DocP>
      <DocP>
        If Argentina ships the regime, three things follow:
      </DocP>
      <DocP>
        <strong>1. Cross-jurisdictional agent commerce becomes
        possible.</strong> A USA-incorporated agent (ClawBank-formed
        Wyoming LLC, doola Agentic LLC, MIDAO entity) can compose with a
        thin AR facade to do business in the AR jurisdiction without itself
        having AR tax residency. RFC-001 § 7 sketches the contractual
        surface.
      </DocP>
      <DocP>
        <strong>2. The reference implementation is open source.</strong> No
        regulator wants a regime that depends on closed proprietary
        infrastructure for compliance. The 16/17 piezas in this toolkit are
        MIT-licensed; any serious operator can audit, fork, contribute, or
        embed.
      </DocP>
      <DocP>
        <strong>3. Other jurisdictions can fork the regime.</strong> The
        legal structure is not coupled to Argentina specifically.
        Singapore, the UAE, Estonia, the Marshall Islands all have
        publicly-stated interest in agent-friendly corporate forms. AR is
        first to ship; others will follow.
      </DocP>

      <DocH2>8 · How to engage</DocH2>
      <DocP>
        <strong>Builders</strong>: <DocCode>pnpm add @ar-agents/identity @ar-agents/mercadopago @ar-agents/facturacion</DocCode>{" "}
        and read the cookbook at{" "}
        <a href="/examples" style={{ color: "var(--accent)" }}>/examples</a>.
        Issues + PRs welcome.
      </DocP>
      <DocP>
        <strong>Regulators</strong>: the formal proposal is{" "}
        <a href="/rfcs/001" style={{ color: "var(--accent)" }}>RFC-001</a>.
        Read it as a draft to comment on. Email naza@naza.ar for
        meetings.
      </DocP>
      <DocP>
        <strong>Investors</strong>: there is a thesis to be written about
        the first jurisdictional bet on AI commerce. The toolkit is the
        public reference implementation. Email naza@naza.ar.
      </DocP>
      <DocP>
        <strong>Journalists</strong>: source material, technical
        background, and the threat-model walkthrough at{" "}
        <a href="/security" style={{ color: "var(--accent)" }}>/security</a>{" "}
        and <a href="/architecture" style={{ color: "var(--accent)" }}>/architecture</a>.
        Email naza@naza.ar for interviews.
      </DocP>
    </DocShell>
  );
}
