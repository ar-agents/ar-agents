import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "Press kit · @ar-agents",
  description:
    "Material listo para prensa sobre @ar-agents/*, la infraestructura para crear y registrar sociedades automatizadas en Argentina. One-pager, datos verificables, links a código, RFC, threat model y contacto del autor.",
  alternates: { canonical: "https://ar-agents.ar/press-kit" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const BULLETS_ES: Array<{ label: string; value: string; sub?: string }> = [
  { label: "Qué es", value: "Infraestructura para crear y registrar una sociedad automatizada argentina, operada por agentes." },
  { label: "Rails", value: "Paquetes open-source @ar-agents/* (pagos, identidad, facturación, banca, off-ramp a pesos). MIT, SLSA v1 provenance." },
  { label: "El Auditor", value: "Capa de confianza paga: log de auditoría firmado (HMAC + Ed25519) que prueba las decisiones del agente." },
  { label: "Autor", value: "Nazareno Clemente, 26 años, monotributista, Buenos Aires." },
  { label: "Licencia", value: "MIT, copy, fork, comercializar permitido." },
  { label: "Origen", value: "Build privado iniciado nov 2025; npm pública desde may 2026." },
  { label: "Estado régimen", value: "Anuncio 28-abr-2026; anteproyecto firmado 28-may-2026, enviado al Senado el 1-jun-2026; todavía no es ley." },
  { label: "Alcance funcional", value: "16 de las 17 piezas (TAD escritura sigue rolling out)." },
  { label: "Filosofía", value: "Edge-Runtime first, Web Crypto only, AbortSignal everywhere." },
];

const ONE_LINERS_ES = [
  "ar-agents es la infraestructura open-source para crear y registrar una sociedad automatizada argentina, operada por agentes de IA. Se alinea con la propuesta del ministro Sturzenegger del 28 de abril de 2026.",
  "Los paquetes @ar-agents/* son los rails gratuitos: pagos (Mercado Pago), identidad (CUIT), facturación (AFIP), banca y off-ramp a pesos. MIT, todas las herramientas auditables, el código se lee línea por línea.",
  "El Auditor es la capa de confianza paga: un log de auditoría firmado (HMAC + Ed25519) que prueba qué decidió el agente. Es la defensa legal del humano bajo el art. 102.",
  "RFC-001 es el marco de responsabilidad propuesto: tres capas (operador / proveedor de modelo / autor de librería) que convierten la pregunta ¿quién paga si la IA rompe algo? en una conversación contractual concreta.",
  "El threat model público (18 amenazas explícitas, 18 mitigaciones) está en /security. No esconde nada.",
];

const CONTACT_BLOCK = [
  { label: "Email", value: "naza@naza.ar" },
  { label: "GitHub", value: "github.com/ar-agents/ar-agents" },
  { label: "npm scope", value: "@ar-agents/* (36 paquetes públicos)" },
  { label: "Sitio", value: "ar-agents.ar" },
  { label: "Implementación de referencia (PDF firmado Ed25519)", value: "ar-agents.ar/implementacion" },
  { label: "Reference implementation (Ed25519-signed PDF, EN)", value: "ar-agents.ar/en/implementation" },
  { label: "Carta abierta al Ministro", value: "ar-agents.ar/al-ministro" },
  { label: "RFC-001", value: "ar-agents.ar/rfcs/001" },
  { label: "Threat model", value: "ar-agents.ar/security" },
  { label: "Wizard de incorporación", value: "ar-agents.ar/incorporar" },
  { label: "Propuesta AAIF working group", value: "github.com/ar-agents/ar-agents/blob/main/AAIF-WORKING-GROUP-PROPOSAL.md" },
];

const NUMBERS_ES = [
  { label: "Paquetes en npm", value: "33" },
  { label: "Tools expuestas", value: "221" },
  { label: "Recetas de cookbook", value: "17" },
  { label: "Subpaths de testing", value: "4" },
  { label: "Tests automatizados", value: "300+" },
  { label: "Provenance attestations", value: "SLSA v1, en cada release" },
  { label: "Tiempo desde primer commit a 36 paquetes", value: "~6 meses" },
  { label: "Costo upfront para usar", value: "USD 0" },
];

export default function PressKitPage() {
  return (
    <DocShell
      eyebrow="press kit · 2026-05"
      title="Press kit."
      subtitle="Material listo-para-publicar sobre @ar-agents/*. One-pager + datos verificables + frases citables + contacto. Pensado para periodistas, investors, regulators y comms teams que necesitan describir el proyecto en una página."
    >
      <DocBlock>
        <DocP>
          Esta página existe para que cualquiera (periodista, asesor de
          ministro, VC, otro programador) pueda explicar el proyecto en
          su propia conversación sin tener que recolectar datos por
          primera vez. Todo lo de abajo es verificable cruzando con el
          repo, npm, y los archivos públicos del sitio.
        </DocP>
      </DocBlock>

      <DocH2>One-pager, qué es @ar-agents en una mirada</DocH2>

      <div
        style={{
          display: "grid",
          gap: 8,
          background: "var(--bg)",
          padding: 18,
          borderRadius: 8,
          boxShadow: "var(--card-shadow)",
          marginBottom: 24,
        }}
      >
        {BULLETS_ES.map((b) => (
          <div
            key={b.label}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr",
              gap: 12,
              alignItems: "baseline",
              fontSize: 14,
              padding: "8px 0",
              borderBottom: "1px solid var(--text-muted)",
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: 600,
              }}
            >
              {b.label}
            </span>
            <span style={{ color: "var(--text)" }}>{b.value}</span>
          </div>
        ))}
      </div>

      <DocH2>Frases citables (es)</DocH2>
      <DocP>
        Cada una está testeada para sobrevivir el test de un editor:
        ninguna afirmación se inventa, ninguna requiere defensa adicional
        más allá del repo público.
      </DocP>

      <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
        {ONE_LINERS_ES.map((q, i) => (
          <blockquote
            key={i}
            style={{
              background: "var(--bg-tint)",
              padding: "14px 18px",
              borderLeft: "3px solid var(--accent)",
              margin: 0,
              borderRadius: 6,
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--text-body)",
              lineHeight: 1.55,
            }}
          >
            “{q}”
          </blockquote>
        ))}
      </div>

      <DocH2>Números verificables</DocH2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {NUMBERS_ES.map((n) => (
          <div
            key={n.label}
            style={{
              background: "var(--bg)",
              padding: 14,
              borderRadius: 6,
              boxShadow: "var(--card-shadow)",
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "var(--text)",
                fontFamily: FONT_MONO,
              }}
            >
              {n.value}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 4,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontFamily: FONT_MONO,
              }}
            >
              {n.label}
            </div>
          </div>
        ))}
      </div>

      <DocH2>Endpoints públicos (machine-readable)</DocH2>
      <DocP>
        Tres surfaces hosted que un agente externo puede invocar
        directamente, sin instalar ningún paquete, sin ningún wrapper:
      </DocP>
      <ul
        style={{
          paddingLeft: 20,
          fontSize: 14,
          lineHeight: 1.7,
          color: "var(--text-body)",
        }}
      >
        <li>
          <code style={{ fontFamily: FONT_MONO }}>POST /api/auto-incorporate</code>:{" "}
        auto-incorporación de una sociedad automatizada en una sola llamada.
          Devuelve <code style={{ fontFamily: FONT_MONO }}>package.json</code>,{" "}
          <code style={{ fontFamily: FONT_MONO }}>agent.ts</code>,{" "}
          <code style={{ fontFamily: FONT_MONO }}>.env.example</code>,{" "}
          <code style={{ fontFamily: FONT_MONO }}>README.md</code>, una URL de
          deploy de Vercel one-click, checklist legal, y referencia firmada
          al audit log. Pensado para que un agente USA-LLC self-incorporate
          programáticamente.
        </li>
        <li>
          <code style={{ fontFamily: FONT_MONO }}>POST /api/play</code>, agent
          loop en vivo con 12 tools mockeados pero realistas. Streaming via
          Vercel AI Gateway. Cada tool call queda HMAC-firmado en el audit
          log keyed por <code style={{ fontFamily: FONT_MONO }}>x-play-session</code>.
        </li>
        <li>
          <code style={{ fontFamily: FONT_MONO }}>GET /api/play/audit/&#123;sessionId&#125;?verify=1</code>:{" "}
        público y verificable. Devuelve las entradas del audit log con su
          firma HMAC-SHA256; el query param hace que el server reverifique y
          reporte si alguna entrada fue tampered.
        </li>
        <li>
          <code style={{ fontFamily: FONT_MONO }}>GET /api/discovery</code> +{" "}
          <code style={{ fontFamily: FONT_MONO }}>?format=openapi</code>,
          inventario de los 36 paquetes + las 235 tools + estos 3 endpoints
          como OpenAPI 3.1 stub. Un agente que crawlea el toolkit lo lee y
          decide qué llamar.
        </li>
      </ul>

      <DocH2>Cómo verificar</DocH2>
      <DocP>
        Todo lo de arriba es chequeable sin pedir nada al autor:
      </DocP>
      <DocP>
        <strong>El código:</strong>{" "}
        <DocCode>git clone https://github.com/ar-agents/ar-agents</DocCode>.
        Repo público, MIT, sin claves de pago bloqueando el acceso.
      </DocP>
      <DocP>
        <strong>Los paquetes:</strong>{" "}
        <DocCode>npm view @ar-agents/identity dist.attestations</DocCode>.
        Devuelve la entrada de Sigstore transparency-log + el commit de
        GitHub que produjo el tarball. Todos los paquetes ship esto.
      </DocP>
      <DocP>
        <strong>El surface de tools:</strong>{" "}
        <DocCode>curl https://ar-agents.ar/api/discovery</DocCode>.
        JSON machine-readable con los 36 paquetes y las 235 tools listadas
        explícitamente. <DocCode>?format=openapi</DocCode> devuelve un OpenAPI
        3.1.0 stub para auditing tools.
      </DocP>
      <DocP>
        <strong>La supply-chain:</strong>{" "}
        <a
          href="https://scorecard.dev/viewer/?uri=github.com/ar-agents/ar-agents"
          style={{ color: "var(--accent)" }}
        >
          scorecard.dev
        </a>{" "}
        audita 18 prácticas semanalmente. La cifra es pública.
      </DocP>

      <DocH2>Capturas + recursos visuales</DocH2>
      <DocP>
        Las páginas siguientes son screenshot-ready (Geist Sans + Geist
        Mono, fondo blanco, sin ads):
      </DocP>
      <ul
        style={{
          paddingLeft: 20,
          fontSize: 14,
          lineHeight: 1.7,
          color: "var(--text-body)",
        }}
      >
        <li>
          <a href="/" style={{ color: "var(--accent)" }}>/</a>, landing
        </li>
        <li>
          <a href="/architecture" style={{ color: "var(--accent)" }}>/architecture</a>:{" "}
        diagrama Mermaid de los 36 paquetes
        </li>
        <li>
          <a href="/security" style={{ color: "var(--accent)" }}>/security</a>:{" "}
        threat model con 18 amenazas
        </li>
        <li>
          <a href="/incorporar" style={{ color: "var(--accent)" }}>/incorporar</a>:{" "}
        wizard live (genera repo + checklist legal)
        </li>
        <li>
          <a href="/playbook" style={{ color: "var(--accent)" }}>/playbook</a>{" "}
          (en) ·{" "}
          <a href="/es/playbook" style={{ color: "var(--accent)" }}>/es/playbook</a>{" "}
          (es), narrativa flagship
        </li>
        <li>
          <a href="/sociedades-ia" style={{ color: "var(--accent)" }}>/sociedades-ia</a>:{" "}
        terminal demo + framing del régimen
        </li>
        <li>
          <a href="/rfcs/001" style={{ color: "var(--accent)" }}>/rfcs/001</a>:{" "}
        RFC con marco de responsabilidad de tres capas
        </li>
        <li>
          <a href="/vs" style={{ color: "var(--accent)" }}>/vs</a>, tabla
          comparativa con AfipSDK / handrolled / consultoría
        </li>
      </ul>

      <DocH2>Contacto</DocH2>
      <div
        style={{
          display: "grid",
          gap: 8,
          background: "var(--bg-tint)",
          padding: 18,
          borderRadius: 8,
        }}
      >
        {CONTACT_BLOCK.map((c) => (
          <div
            key={c.label}
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              gap: 12,
              fontSize: 14,
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: 600,
              }}
            >
              {c.label}
            </span>
            <code
              style={{
                fontFamily: FONT_MONO,
                fontSize: 13,
                color: "var(--text)",
              }}
            >
              {c.value}
            </code>
          </div>
        ))}
      </div>

      <DocP>
        <strong>Disponibilidad para entrevistas / consultas
        regulatorias:</strong> primera respuesta en menos de 48hs vía email.
        Idiomas: español (nativo), inglés (técnico). Zona horaria: UTC-3
        (Buenos Aires) habitualmente, UTC+1 (Madrid) ocasional.
      </DocP>
    </DocShell>
  );
}
