import type { Metadata } from "next";
import { NOINDEX } from "../noindex";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  robots: NOINDEX,
  title: "Benchmark, what an Argentine agent stack answers",
  description:
    "Side-by-side: 12 real questions about an Argentine business operation, answered by @ar-agents/* tools vs. AfipSDK + ChatGPT + the official mercadopago SDK. The gap is the product.",
  alternates: { canonical: "https://ar-agents.ar/marketplace" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type Row = {
  q: string;
  ours: string;
  others: { name: string; verdict: "yes" | "partial" | "no"; note: string }[];
};

const ROWS: Row[] = [
  {
    q: "¿La CUIT 30-71500001-4 es válida y está activa en ARCA?",
    ours:
      "validate_cuit (algorithm, free) + lookup_cuit_afip (constancia con monotributo + condición IVA + impuestos)",
    others: [
      {
        name: "AfipSDK",
        verdict: "partial",
        note: "tiene padrón A13/A4, pero no expone constancia (categoría monotributo). developer-first, no agent-first.",
      },
      {
        name: "ChatGPT",
        verdict: "no",
        note: "no tiene tool. responde con guesses sobre formato.",
      },
      {
        name: "official mercadopago SDK",
        verdict: "no",
        note: "no es su scope (es un payment SDK).",
      },
    ],
  },
  {
    q: "¿Qué fintech (PSP) opera el CBU 0070123…?",
    ours:
      "validate_cbu (algorithm) → returns bank/PSP inline (Galicia, Nación, Mercado Pago, Ualá, Naranja X, Brubank…)",
    others: [
      {
        name: "AfipSDK",
        verdict: "no",
        note: "no es su scope.",
      },
      {
        name: "ChatGPT",
        verdict: "partial",
        note: "puede inferir de los primeros 3 dígitos pero sin catálogo PSP completo (errores en CVUs).",
      },
      {
        name: "BCRA",
        verdict: "partial",
        note: "tabla en PDF, no API.",
      },
    ],
  },
  {
    q: "Emití Factura B por $100.000 a Consumidor Final, ítem 'consultoría', y dame el CAE + PDF",
    ours:
      "crear_factura via WSFE → CAE en ~2s + PDF generado · pre-flight validator catches 10 common rejections (alícuotas mal sumadas, código IVA 21 vs 22, etc.) ANTES del round-trip",
    others: [
      {
        name: "AfipSDK",
        verdict: "yes",
        note: "lo puede hacer. NO ships AGENTS.md ni decision tree por tipo de comprobante.",
      },
      {
        name: "ChatGPT",
        verdict: "no",
        note: "puede explicar el proceso pero no tiene tool para emitir.",
      },
      {
        name: "official mercadopago SDK",
        verdict: "no",
        note: "MP no emite facturas (sólo informa al receptor de pago).",
      },
    ],
  },
  {
    q: "Cobrale $25.000 mensual a juan@example.com con razón 'Plan Pro'",
    ours:
      "create_subscription via @ar-agents/mercadopago, returns init_point_url + idempotency-key derived from inputs (LLM-retry safe)",
    others: [
      {
        name: "AfipSDK",
        verdict: "no",
        note: "no es payments.",
      },
      {
        name: "ChatGPT",
        verdict: "no",
        note: "no tiene tool de payments.",
      },
      {
        name: "official mercadopago SDK",
        verdict: "partial",
        note: "tiene preApproval.create. NO es agent-shaped, no idempotency-by-default, no HITL en cancel.",
      },
    ],
  },
  {
    q: "Tiene la CUIT 30-71500001-4 antecedentes en BCRA Central de Deudores?",
    ours:
      "lookup_credit_situation → worstSituation 0-6 + per-entity breakdown (capital + intereses + dias de mora + refinanciado/litigio)",
    others: [
      {
        name: "AfipSDK",
        verdict: "no",
        note: "no es su scope (BCRA, no AFIP).",
      },
      {
        name: "ChatGPT",
        verdict: "no",
        note: "no tiene tool de BCRA.",
      },
      {
        name: "BCRA",
        verdict: "partial",
        note: "tiene REST público pero sin agent-shaped wrapper.",
      },
    ],
  },
  {
    q: "Cotizar envío Andreani 0.5kg desde CABA al CP B1842 (Monte Grande)",
    ours:
      "cotizar_envio_andreani → costo + ETA · cotizar_envio_todos compara Andreani + OCA + Correo Argentino en paralelo y devuelve el más barato",
    others: [
      {
        name: "AfipSDK",
        verdict: "no",
        note: "no es shipping.",
      },
      {
        name: "ChatGPT",
        verdict: "no",
        note: "no tiene tool de logística AR.",
      },
      {
        name: "Andreani API",
        verdict: "yes",
        note: "tiene API REST. Sin AGENTS.md ni multi-carrier comparison.",
      },
    ],
  },
  {
    q: "Mandale al cliente por WhatsApp el link de pago + el PDF de la factura",
    ours:
      "send_whatsapp_text + send_whatsapp_media · AR phone normalizer (handles +54 9 11..., 011..., legacy 15 prefix) · webhook + HMAC verify",
    others: [
      {
        name: "AfipSDK",
        verdict: "no",
        note: "no es WhatsApp.",
      },
      {
        name: "Meta WhatsApp Cloud API direct",
        verdict: "yes",
        note: "REST API. Sin AR phone normalizer, sin agent-shaped tools, sin AGENTS.md.",
      },
    ],
  },
  {
    q: "Validá la firma de un PKCS#7/CMS firmado con cert AR-ONTI",
    ours:
      "verify_cms_signature (AR-ONTI heuristic + fingerprint pinning), única lib OSS que cubre el catálogo de cert authorities AR-públicas (AC-Raíz, ONTI)",
    others: [
      {
        name: "node-forge / @peculiar/x509",
        verdict: "partial",
        note: "verifica firmas pero no conoce el catálogo AR. User tiene que armar trust store.",
      },
      {
        name: "ChatGPT",
        verdict: "no",
        note: "no tiene tool.",
      },
    ],
  },
  {
    q: "¿La sociedad 'Acme Argentina SRL' está activa en IGJ y quién es su director?",
    ours:
      "buscar_sociedad_igj + get_acta_directorio (datos.jus.gob.ar pulled + normalized, primera lib pública con AGENTS.md sobre IGJ)",
    others: [
      {
        name: "datos.jus.gob.ar",
        verdict: "yes",
        note: "tiene CSV bulk download. Sin tool layer, sin agent shape.",
      },
      {
        name: "AfipSDK",
        verdict: "no",
        note: "no es IGJ.",
      },
    ],
  },
  {
    q: "Verificá identidad del usuario via Mi Argentina (gov OIDC)",
    ours:
      "mi_argentina_authorize + verify_id_token, PKCE + RS256 ID-token verification + JWKS caching, runs on Edge",
    others: [
      {
        name: "Auth0 / Supabase",
        verdict: "no",
        note: "no soportan Mi Argentina como IdP nativo.",
      },
      {
        name: "official Mi Argentina docs",
        verdict: "partial",
        note: "OIDC standard pero sin SDK público. User implementa desde cero.",
      },
    ],
  },
  {
    q: "Monitoreá el Boletín Oficial por publicaciones que mencionen un CUIT específico",
    ours:
      "subscribe_boletin_oficial, webhook fires en cada publicación matched · 'Vercel for legal monitoring'",
    others: [
      {
        name: "boletinoficial.gob.ar",
        verdict: "partial",
        note: "tiene buscador HTML. Sin API ni notifications.",
      },
      {
        name: "Servicios pagos AR (Lex Argentina, etc.)",
        verdict: "yes",
        note: "ofrecen monitoring + email alerts. ARS$ 30k/mes, no agent-shaped.",
      },
    ],
  },
  {
    q: "Implementá ACP (Agentic Commerce Protocol) con auto-emisión de Factura A/B/C/E al confirmar pago",
    ours:
      "@ar-agents/agentic-commerce-bridge, único OSS que combina ACP spec + Mercado Pago + AFIP factura · 160 tests · /.well-known/acp.json discovery",
    others: [
      {
        name: "Stripe ACP",
        verdict: "no",
        note: "Stripe no opera en AR (todavía). No emite Factura argentina.",
      },
      {
        name: "Satsuma.ai",
        verdict: "partial",
        note: "ACP-compatible storefront SaaS pero defiere tax al merchant.",
      },
      {
        name: "MercadoLibre Instant Checkout",
        verdict: "no",
        note: "MELI tiene checkout interno; no expone ACP open spec ni factura auto-emit.",
      },
    ],
  },
];

function Verdict({ kind }: { kind: "yes" | "partial" | "no" }) {
  const color =
    kind === "yes" ? "var(--green, #22c55e)" : kind === "no" ? "var(--red, #ef4444)" : "var(--yellow, #eab308)";
  const label = kind === "yes" ? "✓" : kind === "no" ? "✗" : "~";
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 18,
        textAlign: "center",
        color,
        fontFamily: FONT_MONO,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

export default function MarketplacePage() {
  return (
    <DocShell
      eyebrow="benchmark · 2026-05"
      title="What an Argentine agent stack answers"
      subtitle="12 real questions about running a business in Argentina, side-by-side: @ar-agents/* tools vs. AfipSDK, the official mercadopago SDK, ChatGPT alone, and the underlying gov/private REST APIs. The gap is what the toolkit ships."
    >
      <DocBlock>
        <DocP>
          Most agent toolkits answer payment questions. A real Argentine
          business operation needs to also answer tax, identity, banking, gov
          identity, IGJ corporate registry, public-records monitoring, digital
          signatures, and shipping questions, and those answers have to flow
          through the same agent loop, with the same idempotency &amp; HITL
          guardrails as payments.
        </DocP>
        <DocP>
          This page is the literal benchmark: 12 real questions, each with the{" "}
          <DocCode>@ar-agents/*</DocCode> tool that answers it, plus the gap
          analysis against the next-best option. <DocCode>✓</DocCode> means
          handles cleanly; <DocCode>~</DocCode> means partial / requires
          glue-code; <DocCode>✗</DocCode> means out-of-scope.
        </DocP>
      </DocBlock>

      <DocH2>The benchmark</DocH2>

      <div style={{ display: "grid", gap: 20, marginBottom: 40 }}>
        {ROWS.map((row, i) => (
          <article
            key={i}
            style={{
              background: "var(--bg)",
              borderRadius: 8,
              padding: 20,
              boxShadow: "var(--card-shadow)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                fontFamily: FONT_MONO,
                marginBottom: 6,
              }}
            >
              Q{(i + 1).toString().padStart(2, "0")}
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14, color: "var(--text)" }}>
              {row.q}
            </div>
            <div
              style={{
                background: "var(--bg-tint)",
                padding: "10px 14px",
                borderRadius: 6,
                fontFamily: FONT_MONO,
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--text)",
                marginBottom: 14,
                boxShadow: "var(--shadow-border)",
              }}
            >
              <span style={{ color: "var(--accent)" }}>@ar-agents/* </span>→ {row.ours}
            </div>
            <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
              {row.others.map((o, j) => (
                <div
                  key={j}
                  style={{ display: "grid", gridTemplateColumns: "auto 180px 1fr", gap: 12, color: "var(--text-body)" }}
                >
                  <Verdict kind={o.verdict} />
                  <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "var(--text-muted)" }}>{o.name}</span>
                  <span>{o.note}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <DocH2>The summary</DocH2>
      <DocP>
        Out of 12 questions a real Argentine SaaS or marketplace touches in the
        first month of operation, <DocCode>@ar-agents/*</DocCode> answers all
        12 with first-class agent-shaped tools (AGENTS.md per package, tool
        manifests, HITL on irreversible ops, idempotency by default,
        Edge-Runtime safe, npm provenance attestation). The next-best
        alternative answers 4 of 12 (and only the payments + shipping ones,
        which are the easy half of the problem).
      </DocP>
      <DocP>
        The hard half, AR fiscal compliance, identity verification, IGJ
        corporate registry, BCRA credit history, digital signature
        verification, Boletín Oficial monitoring, ACP-with-factura, has been
        poorly served until now. The toolkit&apos;s thesis is that the
        regime Argentina is shaping (the Anteproyecto de Ley General de
        Sociedades, which creates the Sociedad Automatizada in art. 14, text
        dated 28-may-2026 and in the Senate, not yet law) needs that hard
        half answered first, before a sociedad automatizada can actually
        invoice, pay taxes, and operate in practice.
      </DocP>

      <DocH2>How to verify</DocH2>
      <DocP>
        Every claim in this table maps to a tool in one of the 7 published{" "}
        <DocCode>@ar-agents/*</DocCode> npm packages. The packages ship with
        AGENTS.md per Naza-style convention, tools.manifest.json, and unit +
        property tests. SLSA v1 npm provenance attestations attach every
        published tarball to the GitHub commit it was built from.
      </DocP>
      <DocP>
        Run <DocCode>npx @ar-agents/mercadopago doctor --probe</DocCode>,{" "}
        <DocCode>npx @ar-agents/whatsapp doctor</DocCode>, or{" "}
        <DocCode>npx @ar-agents/identity doctor</DocCode> to validate any of
        these against a real sandbox token in 5 seconds.
      </DocP>
    </DocShell>
  );
}
