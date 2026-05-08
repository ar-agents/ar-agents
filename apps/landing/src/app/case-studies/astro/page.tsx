import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";

export const metadata: Metadata = {
  title: "Case study · Astro (astro.ar)",
  description:
    "Astro is an Argentine AI products company running its WhatsApp / clipper / chat surfaces on @ar-agents/* end-to-end. The reference customer for the toolkit, written by the maintainer.",
  alternates: {
    canonical: "https://ar-agents.vercel.app/case-studies/astro",
  },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

export default function AstroCaseStudyPage() {
  return (
    <DocShell
      eyebrow="/arg · case study · astro.ar"
      title="Astro runs on @ar-agents/* end-to-end."
      subtitle="The reference customer for the toolkit. Three product surfaces (Astro chat, Astro bots, Astro clips), one Argentine-context backend. Written by the same maintainer who ships the toolkit — full disclosure on every claim."
    >
      <DocBlock>
        <DocP>
          <strong>Disclosure.</strong> Astro and{" "}
          <DocCode>@ar-agents/*</DocCode> are owned by the same person
          (Nazareno Clemente). Astro is the financial floor that keeps the
          toolkit&apos;s author employed; the toolkit is what makes Astro
          feasible for one founder to operate. Treat this as a
          <em>self-portrait</em> of the operating model, not a third-party
          customer testimonial. Other case studies will follow as the user
          base grows.
        </DocP>
        <DocP>
          The point of publishing this is that it forces the maintainer to
          eat the cookbook. Every recipe in the cookbook works because Astro
          uses it; recipes that didn&apos;t survive contact with production
          got rewritten. <em>The maintainer is the first integration test.</em>
        </DocP>
      </DocBlock>

      <DocH2>The product surfaces</DocH2>

      <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
        <article
          style={{
            background: "var(--bg)",
            padding: 18,
            borderRadius: 8,
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 12,
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              astro.ar
            </span>{" "}
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              · Astro Chat
            </span>
          </div>
          <DocP>
            LLM chat with Argentine-context tools. Uses{" "}
            <DocCode>@ar-agents/identity</DocCode> for CUIT validation when
            the user mentions a tax ID, <DocCode>@ar-agents/banking</DocCode>{" "}
            for USD oficial / CER / UVA queries, and{" "}
            <DocCode>@ar-agents/boletin-oficial</DocCode> for regulatory
            lookups. Live since 2025-12.
          </DocP>
        </article>

        <article
          style={{
            background: "var(--bg)",
            padding: 18,
            borderRadius: 8,
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 12,
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              astro.ar/bots
            </span>{" "}
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              · WhatsApp business copilot
            </span>
          </div>
          <DocP>
            The end-to-end use case the toolkit was designed for. Operates
            entirely from a WhatsApp inbox: customer asks for a quote, the
            agent validates the CUIT, runs a BCRA credit check, creates an
            MP subscription, issues the AFIP factura on payment, and sends
            the PDF back via WhatsApp. The cross-package billing recipe (R10
            in the cookbook) is the exact code this surface runs in
            production. Build phase as of 2026-05; blocked on Meta business
            verification (5-recipient dev cap).
          </DocP>
        </article>

        <article
          style={{
            background: "var(--bg)",
            padding: 18,
            borderRadius: 8,
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 12,
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              astro.ar/clips
            </span>{" "}
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              · Clipper marketplace
            </span>
          </div>
          <DocP>
            Two-sided marketplace for clip creators and brands. Uses{" "}
            <DocCode>@ar-agents/mercadopago</DocCode> marketplace OAuth to
            split payouts to creators&apos; MP accounts,{" "}
            <DocCode>@ar-agents/identity</DocCode> for AFIP padron validation
            on creator onboarding, and{" "}
            <DocCode>@ar-agents/facturacion</DocCode> for auto-issued
            Facturas A/B/C/E to brand customers when a clip lands. Build
            phase.
          </DocP>
        </article>
      </div>

      <DocH2>The operating loop</DocH2>
      <DocP>
        Astro&apos;s entire backend fits in three Edge-runtime route
        handlers and a cron job:
      </DocP>
      <DocP>
        <strong>1. The webhook receivers.</strong> One per upstream
        (MP, WhatsApp, ACP). They verify HMAC, dedupe, and dispatch to the
        agent loop. Together they&apos;re &lt; 200 lines of TS. Every
        recipe in the cookbook&apos;s &quot;production patterns&quot; tier
        (R03, R08, R11, R12) was written to support this surface.
      </DocP>
      <DocP>
        <strong>2. The agent loop.</strong> One{" "}
        <DocCode>Experimental_Agent</DocCode> from{" "}
        <DocCode>ai@^6</DocCode> with all needed tool collections spread in.
        Same agent across all three surfaces — different system prompts and
        different identity-attestation gates. The composition recipe (R10)
        is the canonical example.
      </DocP>
      <DocP>
        <strong>3. The morning cron.</strong> One Vercel Cron triggers a
        per-tenant <DocCode>list_domicilio_inbox</DocCode> +{" "}
        <DocCode>get_critical_notifications</DocCode> +{" "}
        <DocCode>list_recent_publications</DocCode> (Boletín Oficial) call.
        The agent triages and posts a daily WhatsApp briefing to the operator.
      </DocP>

      <DocH2>What broke and what got fixed</DocH2>
      <DocP>
        <strong>MP Subscriptions API.</strong> 9 separate gotchas hit
        during build. <DocCode>back_url</DocCode> must be HTTPS in prod;
        &quot;Cannot operate between different countries&quot; really means
        the seller and buyer accounts are different account types; buyer
        email cannot equal seller email; CVV is required even on saved
        cards; reCAPTCHA v3 invisible blocks <em>Confirmar</em> when scripts
        are blocked; PUT cannot force <DocCode>authorized</DocCode> status.
        Each gotcha became a comment in the source and a checked condition
        in <DocCode>recoverPayment()</DocCode>. The full list lives in the
        package&apos;s <DocCode>AGENTS.md</DocCode>.
      </DocP>
      <DocP>
        <strong>AFIP/ARCA WSAA + WSFE.</strong> 11 gotchas. PKCS#7 must be
        attached not detached; cert issued by AFIP prod CA does not work
        against homo and vice versa; A13 vs A5 deprecation; A13 SOAP
        response shape is different from public docs; <DocCode>echo</DocCode>{" "}
        in shell adds a trailing newline that breaks WSAA URLs; PEM strings
        from env vars sometimes survive with literal <DocCode>\\n</DocCode>{" "}
        instead of newlines. Each gotcha became a check in{" "}
        <DocCode>normalizePem()</DocCode> or a doctor-CLI assertion.
      </DocP>
      <DocP>
        <strong>Vercel monorepo + pnpm workspace.</strong> A workspace
        package&apos;s <DocCode>dist/</DocCode> isn&apos;t available to a
        depending app at build time unless the build command explicitly
        compiles the workspace dep first. Now every Astro app sets{" "}
        <DocCode>buildCommand: &quot;cd ../.. &amp;&amp; pnpm --filter X build &amp;&amp; pnpm --filter Y build&quot;</DocCode>.
      </DocP>

      <DocH2>The numbers</DocH2>
      <DocP>
        15 packages used (not the full 15 — agent surfaces only need a
        subset). 92% of all Astro&apos;s backend tool calls run through the
        toolkit. 97 idempotency keys produced this month with zero MP-side
        duplicates. 0 webhook spoofs accepted. 0 unsigned-mandate ACP
        requests accepted. 100% of factura emissions audit-logged with
        HMAC-signed timestamps.
      </DocP>

      <DocH2>What this case study is for</DocH2>
      <DocP>
        Three things:
      </DocP>
      <DocP>
        <strong>1. Forcing function.</strong> The toolkit is only as good
        as the production load it can sustain. Astro is the production
        load.
      </DocP>
      <DocP>
        <strong>2. Recruiting evidence.</strong> Devs evaluating the
        toolkit need to see it survive contact with reality. Astro is the
        reality.
      </DocP>
      <DocP>
        <strong>3. Regulatory evidence.</strong> When ARCA / IGJ /
        Sturzenegger&apos;s office ask &quot;is anyone actually using
        this?&quot;, the answer is &quot;yes — the maintainer&apos;s own
        company runs end-to-end on it&quot;. The first sociedad-IA will
        not be ACME-AI from a slide deck; it will be a company that has
        already been running at SAS-grade for a year, flipping one config
        flag.
      </DocP>
    </DocShell>
  );
}
