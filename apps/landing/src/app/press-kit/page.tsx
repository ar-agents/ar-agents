import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "Press kit · @ar-agents",
  description:
    "Press-ready material for @ar-agents/* — el toolkit open-source para sociedades-IA argentinas. One-pager, datos verificables, links a code, RFC, threat model, y contacto del autor.",
  alternates: { canonical: "https://ar-agents.vercel.app/press-kit" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const BULLETS_ES: Array<{ label: string; value: string; sub?: string }> = [
  { label: "Qué es", value: "Toolkit open-source para construir sociedades-IA argentinas." },
  { label: "Status", value: "16 paquetes en npm, 168 herramientas, MIT, SLSA v1 provenance." },
  { label: "Autor", value: "Nazareno Clemente, 26 años, monotributista, Buenos Aires." },
  { label: "Licencia", value: "MIT — copy, fork, comercializar permitido." },
  { label: "Origen", value: "Build privado iniciado nov 2025; npm pública desde may 2026." },
  { label: "Estado régimen", value: "Anuncio Sturzenegger 28-abr-2026; ley estimada H1 2027." },
  { label: "Alcance funcional", value: "16 de las 17 piezas (TAD escritura sigue rolling out)." },
  { label: "Filosofía", value: "Edge-Runtime first, Web Crypto only, AbortSignal everywhere." },
];

const ONE_LINERS_ES = [
  "ar-agents es la implementación de referencia open-source para sociedades-IA argentinas — la propuesta del ministro Sturzenegger del 28 de abril de 2026.",
  "16 paquetes npm, 168 herramientas, todas auditables. MIT-licensed. Cualquier operador serio puede leer el código línea por línea.",
  "El stack cubre 16 de las 17 piezas operativas que una empresa argentina necesita: identity, banking, factura electrónica, MP, ML, WhatsApp, BCRA, Boletín Oficial, IGJ, GDE/TAD.",
  "RFC-001 es el marco de responsabilidad propuesto: tres capas (operador / proveedor de modelo / autor de librería) que convierten el ataque ¿quién paga si la IA rompe algo? en una conversación contractual concreta.",
  "El threat model público (14 amenazas explícitas, 14 mitigaciones) está en /security. No esconde nada.",
];

const CONTACT_BLOCK = [
  { label: "Email", value: "naza@helloastro.co" },
  { label: "GitHub", value: "github.com/ar-agents/ar-agents" },
  { label: "npm scope", value: "@ar-agents/* (16 paquetes públicos)" },
  { label: "Sitio", value: "ar-agents.vercel.app" },
  { label: "RFC-001", value: "ar-agents.vercel.app/rfcs/001" },
  { label: "Threat model", value: "ar-agents.vercel.app/security" },
  { label: "Wizard de incorporación", value: "ar-agents.vercel.app/incorporar" },
];

const NUMBERS_ES = [
  { label: "Paquetes en npm", value: "16" },
  { label: "Tools expuestas", value: "168" },
  { label: "Recetas de cookbook", value: "17" },
  { label: "Subpaths de testing", value: "4" },
  { label: "Tests automatizados", value: "300+" },
  { label: "Provenance attestations", value: "SLSA v1, en cada release" },
  { label: "Tiempo desde primer commit a 16 paquetes", value: "~6 meses" },
  { label: "Costo upfront para usar", value: "USD 0" },
];

export default function PressKitPage() {
  return (
    <DocShell
      eyebrow="/arg · press kit · 2026-05"
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

      <DocH2>One-pager — qué es @ar-agents en 8 líneas</DocH2>

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
        <DocCode>curl https://ar-agents.vercel.app/api/discovery</DocCode>.
        JSON machine-readable con los 16 paquetes y las 168 tools listadas
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
          <a href="/" style={{ color: "var(--accent)" }}>/</a> — landing
        </li>
        <li>
          <a href="/architecture" style={{ color: "var(--accent)" }}>/architecture</a>{" "}
          — diagrama Mermaid de los 16 paquetes
        </li>
        <li>
          <a href="/security" style={{ color: "var(--accent)" }}>/security</a>{" "}
          — threat model con 14 amenazas
        </li>
        <li>
          <a href="/incorporar" style={{ color: "var(--accent)" }}>/incorporar</a>{" "}
          — wizard live (genera repo + checklist legal)
        </li>
        <li>
          <a href="/playbook" style={{ color: "var(--accent)" }}>/playbook</a>{" "}
          (en) ·{" "}
          <a href="/es/playbook" style={{ color: "var(--accent)" }}>/es/playbook</a>{" "}
          (es) — narrativa flagship
        </li>
        <li>
          <a href="/sociedades-ia" style={{ color: "var(--accent)" }}>/sociedades-ia</a>{" "}
          — terminal demo + framing del régimen
        </li>
        <li>
          <a href="/rfcs/001" style={{ color: "var(--accent)" }}>/rfcs/001</a>{" "}
          — RFC con marco de responsabilidad de tres capas
        </li>
        <li>
          <a href="/vs" style={{ color: "var(--accent)" }}>/vs</a> — tabla
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
