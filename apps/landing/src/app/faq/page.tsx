import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { JsonLd } from "../json-ld";

export const metadata: Metadata = {
  title: "/faq · regulator + dev questions answered",
  description:
    "21 questions a Sturzenegger asesor, journalist, builder, or external agent would ask about ar-agents, answered crisply, with verifiable links. JSON-LD FAQPage for rich results.",
  alternates: { canonical: "https://ar-agents.ar/faq" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";

type Q = {
  q: string;
  a: string; // markdown-light: <a>, <code>, <strong> handled inline
  audience: "regulator" | "developer" | "agent" | "investor" | "journalist";
};

const FAQS: Q[] = [
  // ─── Regulator + policy ──────────────────────────────────────────────
  {
    audience: "regulator",
    q: "¿Qué es ar-agents? ¿Es un proyecto del gobierno?",
    a: 'No. ar-agents es un proyecto open-source civil-comercial, escrito por Nazareno Clemente. Sin financiamiento estatal, sin relación contractual con ningún ministerio. La iniciativa pública relevante: el anuncio del régimen (Sturzenegger, Expo EFI, 28-abr-2026) y luego el Anteproyecto de Ley General de Sociedades (texto firmado por Santiago Viola el 28-may-2026, enviado al Senado el 1-jun-2026, todavía no es ley). ar-agents es la implementación de referencia técnica que un régimen así necesita para operar el día 1. MIT-licensed, públicamente auditable en <a href="https://github.com/ar-agents/ar-agents">github.com/ar-agents/ar-agents</a>.',
  },
  {
    audience: "regulator",
    q: "Si la ley de sociedades automatizadas no pasa, ¿qué utilidad tiene?",
    a: 'Cubre 16 piezas operativas de cualquier empresa argentina hoy (factura electrónica, BCRA, Mercado Pago, WhatsApp, IGJ, Boletín Oficial). Funciona como toolkit estándar para SaaS argentinos sin importar el régimen. La parte de la sociedad automatizada es <em>aditiva</em>: el día que la ley pase, el toolkit ya está listo. Si la ley no pasa, sigue siendo el toolkit más completo del ecosistema.',
  },
  {
    audience: "regulator",
    q: "¿Quién responde si la IA rompe algo? ¿Hay liability framework?",
    a: 'Sí. <a href="/rfcs/001">RFC-001 § 9</a> propone un marco de tres capas: (1) operador, la entidad que despliega, asume responsabilidad operacional; (2) proveedor del modelo, Anthropic/OpenAI/Google según sus SLAs; (3) autor de la librería, open source MIT, sin garantía. Convierte la pregunta filosófica en un contrato concreto. El audit log HMAC-firmado (RFC-001 § 9.2) es el mecanismo probatorio.',
  },
  {
    audience: "regulator",
    q: "¿Cómo se garantiza que el audit log no fue manipulado?",
    a: 'Cada entry se firma con HMAC-SHA256 sobre canonical-JSON al momento de la escritura. El secret vive solo server-side. Cualquiera puede recomputar la firma en <a href="/verify">/verify</a> y ver si coincide. Si una entrada fue editada después de la firma, <code>tampered</code> sale &gt; 0 mecánicamente. Es tamper-evidente para un testigo que ya tenga la entrada; el anclaje externo (RFC-006) es lo que lo vuelve defensible contra el propio operador. Demo en vivo: <a href="/api/play/tamper-demo">/api/play/tamper-demo</a>. El anteproyecto respalda este enfoque: art. 263 exige registros digitales públicamente verificables, art. 102 fija el deber de configuración y supervisión, y art. 101 exige un procedimiento de decisión adecuado. RFC-001 § 9.2 lo desarrolla como mecanismo probatorio.',
  },
  {
    audience: "regulator",
    q: "¿Qué autoridad tienen las decisiones que toma una sociedad automatizada?",
    a: 'El nombre legal de la figura es <strong>Sociedad Automatizada</strong> (art. 14 del anteproyecto; texto firmado 28-may-2026, en el Senado desde el 1-jun-2026, todavía no es ley). Si se sanciona, sus decisiones tendrían la misma autoridad que las de cualquier persona jurídica argentina (firmar contratos, emitir facturas, ser titular de cuenta bancaria). La ley es explícita en que el uso de IA en la gestión no excluye la responsabilidad de los administradores ni el deber de configuración y supervisión del sistema (art. 102). El humano representante (RFC-001 § 3.1) firma el acto constitutivo y queda responsable por las decisiones de capa 1 (configuración del operador), no por las decisiones del modelo (capa 2).',
  },
  {
    audience: "regulator",
    q: "¿Qué pasa con AFIP, IGJ, BCRA? ¿Hay integración real?",
    a: 'Sí. <code>@ar-agents/identity</code> usa cert WSAA para padron ARCA real (homo + prod). <code>@ar-agents/facturacion</code> emite via WSFE real. <code>@ar-agents/banking</code> consulta BCRA Principales Variables (público) y Central de Deudores (adapter). <code>@ar-agents/igj</code> consulta el dataset CKAN público. <code>@ar-agents/gde-tad</code> tiene lectura del DEC inbox y pre-flight de IGJ. La pieza 17 (escritura programática en TAD) sigue blocked por falta de API documentada del Estado.',
  },
  {
    audience: "regulator",
    q: "¿Cuántas tools, packages, y endpoints están en producción?",
    a: '36 packages npm publicados con SLSA v1 provenance, 235 tools, 5 endpoints HTTP hosted (<code>/api/auto-incorporate</code>, <code>/api/play</code>, <code>/api/play/audit/{sessionId}</code>, <code>/api/play/tamper-demo</code>, <code>/api/badge/{sessionId}</code>), 1 SDK (<code>@ar-agents/incorporate</code>), 19 cookbook recipes, 67 unit tests. Todo verificable en <a href="/api/discovery">/api/discovery</a> (machine-readable JSON o OpenAPI 3.1).',
  },

  // ─── Developer / builder ─────────────────────────────────────────────
  {
    audience: "developer",
    q: "¿Cómo arranco un proyecto desde cero?",
    a: 'Tres paths según preferencia:<br/>1. <strong>Wizard humano</strong>: <a href="/incorporar">/incorporar</a> → completás un form, descargás 4 archivos, deploy.<br/>2. <strong>SDK programático</strong>: <code>pnpm add @ar-agents/incorporate</code> → <code>await incorporate({...})</code>. <a href="/sdk">/sdk</a> tiene quickstart.<br/>3. <strong>Template starter</strong>: clonar <code>apps/sociedad-ia-starter</code> directamente. <a href="https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter">Ver código</a>.',
  },
  {
    audience: "developer",
    q: "¿Qué runtime soporta?",
    a: 'Vercel Edge Runtime, Cloudflare Workers, Deno, Node 20+, browsers (con CORS). Todo el código usa Web Crypto + fetch, cero <code>node:crypto</code> en producción. <a href="/architecture">/architecture</a> tiene el contrato Edge-Runtime completo. La única excepción es <code>@ar-agents/identity/wsaa</code> que usa node-forge para firmar PKCS#7 (importable por subpath para no contaminar el bundle).',
  },
  {
    audience: "developer",
    q: "¿El toolkit funciona sin las credenciales reales?",
    a: 'Sí. Cada package degrada graciosamente. Sin AFIP cert, <code>identityTools</code> usa <code>UnconfiguredAfipPadronAdapter</code> que devuelve <code>available: false</code> con mensaje útil. Sin MP token, <code>mercadoPagoTools</code> simplemente no se incluye en el agent loop. La app sigue funcionando, los tools faltantes surfaceán el error al usuario. Útil para PR previews y local dev sin secrets.',
  },
  {
    audience: "developer",
    q: "¿Cómo escalo a multi-tenant?",
    a: 'Cada cliente externo (MercadoPagoClient, WsfeClient, etc.) se construye con un <code>accessToken</code> por tenant. El audit log es session-scoped via <code>sessionId</code>. Para spawn dinámico de sociedades por tenant, <a href="/examples#20">cookbook recipe 20</a> muestra el patrón usando <code>@ar-agents/incorporate</code> + KV-backed multi-tenant routing.',
  },
  {
    audience: "developer",
    q: "¿Qué tan estable es la API?",
    a: 'Cada package versiona vía <a href="https://www.conventionalcommits.org/">conventional commits</a> + Changesets. Major versions implican breaking changes documentados en CHANGELOG.md. <code>@ar-agents/incorporate</code> v0.x es alpha; el endpoint <code>/api/auto-incorporate</code> ya es estable y retro-compatible. Las result-shape interfaces están <code>readonly</code> donde tiene sentido.',
  },
  {
    audience: "developer",
    q: "¿Hay tipos TypeScript completos?",
    a: 'Sí. Cada package ship <code>.d.ts</code> + <code>.d.cts</code>, validados con <a href="https://arethetypeswrong.github.io/">arethetypeswrong</a> 🟢 across node10/node16/bundler. <a href="https://publint.dev/">publint</a> tampoco encuentra issues. Los tool inputSchemas son zod schemas tipados, así que los args llegan typed al execute.',
  },

  // ─── Agent (LLM consuming the surface) ──────────────────────────────
  {
    audience: "agent",
    q: "Soy un LLM agent. ¿Cómo descubro las capabilities?",
    a: '4 paths machine-readable:<br/>1. <code>GET /.well-known/agents.json</code>, agents.md convention con per-agent operating instructions.<br/>2. <code>GET /.well-known/ai-plugin.json</code>, OpenAI plugin spec.<br/>3. <code>GET /api/discovery</code>, JSON inventory (36 packages + 235 tools + 5 endpoints).<br/>4. <code>GET /api/discovery?format=openapi</code>, OpenAPI 3.1 stub.',
  },
  {
    audience: "agent",
    q: "Si quiero auto-incorporar una sociedad automatizada argentina, ¿qué hago?",
    a: 'Una sola llamada: <code>POST /api/auto-incorporate</code> con <code>{ denominacion, tipo, capitalSocial, objeto }</code>. Recibís: 4 archivos generados (package.json + agent.ts + .env.example + README.md), Vercel deploy URL one-click, lista de env-vars, checklist legal/operativo, audit-log reference firmada. <a href="/sdk">SDK típado: <code>@ar-agents/incorporate</code></a>. Ver <a href="/examples#18">cookbook recipe 18</a>.',
  },
  {
    audience: "agent",
    q: "¿Cómo persisto continuidad forense entre múltiples llamadas?",
    a: 'Pasá el mismo <code>sessionId</code> en cada request (header <code>x-play-session</code> en /api/play, campo <code>sessionId</code> en /api/auto-incorporate). El audit log se chainea bajo ese ID. Después: <code>GET /api/play/audit/{sessionId}?verify=1</code> devuelve toda la cadena verificada. <code>GET /api/badge/{sessionId}</code> devuelve un SVG embebible.',
  },
  {
    audience: "agent",
    q: "¿Qué hago si una tool devuelve available:false?",
    a: 'Surfacear el error verbatim al usuario y NO inventar el dato faltante. Ejemplo: si <code>lookup_cuit_afip</code> devuelve <code>{ available: false, error: "..." }</code>, el agente debe decir literalmente "el padrón ARCA no está disponible para este CUIT" en lugar de alucinar una razón social.',
  },

  // ─── Investor / partner ──────────────────────────────────────────────
  {
    audience: "investor",
    q: "¿Es un negocio o un proyecto open-source?",
    a: 'Open-source MIT con runway potencial via servicios hosted (incorporación llave-en-mano, KV multi-tenant, audit-log compliance dashboard). El toolkit en sí queda libre. La <em>plataforma</em> que lo opera (auth, billing, multi-tenant KV) es donde vive un negocio si crece.',
  },
  {
    audience: "investor",
    q: "¿Cuál es la moat?",
    a: '(1) First-mover en la jurisdicción AR + alineación con el régimen de sociedades automatizadas. (2) Cobertura del 16/17 piezas operativas, nadie más lo tiene completo. (3) RFC-001 governance framework, marco original. (4) Audit log HMAC + KV, primitivos forenses que requieren disciplina, no solo código. (5) Network: <code>@ar-agents/incorporate</code> es la entrada canónica para agentes externos USA-LLC / DAO LLCs / Estonia e-Residency a operar en AR.',
  },

  // ─── Journalist / general ───────────────────────────────────────────
  {
    audience: "journalist",
    q: "¿Cuándo arrancó el proyecto?",
    a: 'Primer commit privado nov 2025. Primer package npm published 5-may-2026. Anuncio Sturzenegger 28-abr-2026 reorientó la narrativa de "AR ops toolkit" a "implementación de referencia para sociedades automatizadas". El monorepo público tiene 200+ commits en ~6 meses.',
  },
  {
    audience: "journalist",
    q: "¿Hay alguien usándolo en producción?",
    a: 'El maintainer (Naza) está en mid-cutover de Astro Chat (astro.ar) a <code>@ar-agents/*</code>, feat-branch público en <a href="https://github.com/naza00000/astro/tree/feat/ar-agents-cutover">naza00000/astro/feat/ar-agents-cutover</a>. <a href="/case-studies/astro">/case-studies/astro</a> es la migration log honesta. Otros early-adopters: pendientes de anuncio.',
  },
];

const AUDIENCE_LABEL: Record<Q["audience"], string> = {
  regulator: "Regulador / asesor",
  developer: "Developer / builder",
  agent: "LLM agent",
  investor: "Investor / partner",
  journalist: "Periodista",
};

const AUDIENCE_COLOR: Record<Q["audience"], { fg: string; bg: string }> = {
  regulator: { fg: "#ff5b4f", bg: "#fff1f0" }, // ship-red, high stakes
  developer: { fg: "#0a72ef", bg: "#ebf5ff" }, // develop-blue
  agent: { fg: "#7928ca", bg: "#f5edfd" }, // console-purple
  investor: { fg: "#22c55e", bg: "#ecfdf5" },
  journalist: { fg: "#666666", bg: "#f5f5f5" },
};

const AUDIENCES_ORDER: Q["audience"][] = [
  "regulator",
  "developer",
  "agent",
  "investor",
  "journalist",
];

export default function FaqPage() {
  // Render answers safely, only sanitized HTML inline (we control it).
  // Building FAQPage JSON-LD for rich results.
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a.replace(/<[^>]+>/g, ""), // plain-text version for the schema
      },
    })),
  };

  return (
    <DocShell
      eyebrow="faq · 21 preguntas"
      title="FAQ."
      subtitle="21 preguntas que un asesor de Sturzenegger, un developer, un LLM agent, un investor o un periodista podría hacer, respondidas con links verificables. Schema.org FAQPage para rich results en buscadores."
    >
      <DocBlock>
        <DocP>
          Las preguntas están agrupadas por audiencia. Si sos regulador,
          empezá con la sección{" "}
          <span style={{ color: AUDIENCE_COLOR.regulator.fg, fontWeight: 600 }}>
            Regulador / asesor
          </span>
          . Si sos developer construyendo encima del toolkit, andá a{" "}
          <span style={{ color: AUDIENCE_COLOR.developer.fg, fontWeight: 600 }}>
            Developer / builder
          </span>
          . Si sos un LLM agent crawleando el dominio, vas a la sección{" "}
          <span style={{ color: AUDIENCE_COLOR.agent.fg, fontWeight: 600 }}>
            LLM agent
          </span>{" "}
          después de leer{" "}
          <a href="/.well-known/agents.json" style={{ color: "var(--accent)" }}>
            /.well-known/agents.json
          </a>
          .
        </DocP>
      </DocBlock>

      {AUDIENCES_ORDER.map((audience) => {
        const items = FAQS.filter((f) => f.audience === audience);
        if (items.length === 0) return null;
        const tone = AUDIENCE_COLOR[audience];
        return (
          <section
            key={audience}
            id={audience}
            style={{ marginBottom: 32 }}
            aria-labelledby={`heading-${audience}`}
          >
            <DocH2>
              <a
                id={`heading-${audience}`}
                href={`#${audience}`}
                style={{ color: tone.fg, textDecoration: "none" }}
              >
                {AUDIENCE_LABEL[audience]}
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: FONT_MONO,
                    color: "var(--text-muted)",
                    fontWeight: 400,
                    marginLeft: 8,
                  }}
                >
                  · {items.length}
                </span>
              </a>
            </DocH2>
            <div style={{ display: "grid", gap: 12 }}>
              {items.map((f, i) => (
                <details
                  key={i}
                  style={{
                    background: "var(--bg)",
                    padding: "12px 16px",
                    borderRadius: 8,
                    boxShadow: SHADOW_BORDER,
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      fontSize: 15,
                      fontWeight: 500,
                      color: "var(--text)",
                      lineHeight: 1.5,
                      listStyle: "none",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 18,
                        color: tone.fg,
                        fontFamily: FONT_MONO,
                        fontSize: 12,
                        marginRight: 6,
                      }}
                      aria-hidden="true"
                    >
                      ▸
                    </span>
                    {f.q}
                  </summary>
                  <div
                    style={{
                      marginTop: 10,
                      paddingLeft: 24,
                      fontSize: 14,
                      color: "var(--text-body)",
                      lineHeight: 1.6,
                    }}
                    // Safe, content is fully under our control above.
                    dangerouslySetInnerHTML={{ __html: f.a }}
                  />
                </details>
              ))}
            </div>
          </section>
        );
      })}

      <DocH2>¿Algo que no respondimos?</DocH2>
      <DocP>
        Email <a href="mailto:naza@naza.ar" style={{ color: "var(--accent)" }}>naza@naza.ar</a>{" "}
        o abrí un issue en{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/issues/new?labels=question&template=question.md"
          style={{ color: "var(--accent)" }}
        >
          github.com/ar-agents/ar-agents
        </a>
        . Toda pregunta nueva que aparezca seguido entra a esta página.
      </DocP>

      <JsonLd data={faqJsonLd} />
    </DocShell>
  );
}
