"use client";

import { useState } from "react";
import Link from "next/link";

interface Snippet {
  id: string;
  audience: "twitter" | "linkedin" | "email-regulator" | "email-journalist" | "email-asesor";
  title: string;
  body: string;
  notes: string;
}

const SNIPPETS: ReadonlyArray<Snippet> = [
  {
    id: "twitter-1-launch",
    audience: "twitter",
    title: "Tweet · launch announcement",
    body: `Argentina anunció sociedades-IA el 28-abr. Publiqué 6 RFCs + infraestructura open-source que la ley puede citar:

· RFC-001, responsabilidad civil (3 capas)
· RFC-002, descubrimiento
· RFC-003, reciprocidad cross-jurisdiccional
· RFC-004, log operativo

Todo MIT + CC-BY-4.0. ar-agents.ar`,
    notes: "Best for: kickoff thread. Spanish, Argentina-centric. Aim at @cesargazzo (Subsec TIC) + @lasturze (Sturzenegger) for cross-pollination. Replies-friendly.",
  },
  {
    id: "twitter-2-certifier",
    audience: "twitter",
    title: "Tweet · /certifier launch",
    body: `Cualquiera puede verificar la conformidad de una sociedad-IA argentina en 10 segundos, sin install.

→ ar-agents.ar/certifier

Pegás cualquier URL, scorea 0-100 contra RFC-002 + RFC-004.

La implementación de referencia se auto-certifica 100/100.

Anyone, anywhere, no auth.`,
    notes: "Best for: technical audience. The 100/100 number is verifiable + impressive. Include the badge SVG inline if the platform allows.",
  },
  {
    id: "twitter-3-test-vectors",
    audience: "twitter",
    title: "Tweet · test vectors / conformance",
    body: `Publiqué los 7 vectores de conformidad RFC-004 con valores hex deterministas.

ar-agents.ar/test-vectors

Cualquier biblioteca (TS, Python, Go, Rust...) puede correr esos vectores y reclamar conformidad. La spec ya no es negociable; o pasa o no pasa.

La impl de referencia pasa los 7 (96 tests).`,
    notes: "Best for: developers + technically-minded press. The 'deterministic byte-for-byte' framing is the punchline.",
  },
  {
    id: "linkedin-1-narrative",
    audience: "linkedin",
    title: "LinkedIn post · long narrative",
    body: `Hace un mes el ministro Sturzenegger anunció un régimen de sociedades-IA en Argentina.

Decidí no esperar a que se publique el texto del proyecto de ley. La infraestructura técnica para que las sociedades-IA funcionen ya existe, había que escribirla.

Publiqué 6 RFCs que cubren las cuatro decisiones clave que toda legislación de este tipo necesita resolver:

→ Responsabilidad civil (RFC-001): tres capas, según la clase de governance asignada a cada acción.
→ Descubrimiento (RFC-002): cada sociedad-IA publica su info en /.well-known/agents.json. Sin registro central, sin permiso.
→ Reciprocidad cross-jurisdiccional (RFC-003): envelope JSON portable para que una sociedad-IA argentina pueda probar transacciones con una Wyoming DAO LLC o una Estonia OÜ.
→ Log operativo (RFC-004): el formato exacto del registro auditable que cada sociedad debe llevar. Con 7 vectores de conformidad deterministas.

Más: un certificador público que scorea cualquier URL 0-100 en 10 segundos (ar-agents.ar/certifier), 36 npm packages que cubren MercadoPago, AFIP/ARCA, WhatsApp, banking, factura electrónica, etc., 26 cookbook recipes, 96 tests unitarios, una plantilla Vercel deployable, un wizard de auto-incorporación, un dashboard de auditoría con SSE en vivo.

Todo MIT + CC-BY-4.0. Sin honorarios para consultas con asesores legislativos.

La pregunta que sigue es política: ¿la ley va a citar este trabajo por referencia, o va a reinventar todo desde cero?

Code: github.com/ar-agents/ar-agents
Documentos para legisladores: ar-agents.ar/legislacion
Para regulators / journalists: ar-agents.ar/auditor`,
    notes: "Best for: LinkedIn, long-form is rewarded. Audience: techies + lawyers + policy folk. Tone: confident, not pushy. The 'sin honorarios' line is genuine + disarms.",
  },
  {
    id: "email-1-sturzenegger-asesor",
    audience: "email-asesor",
    title: "Email · cold to Sturzenegger / Desregulación asesor técnico",
    body: `Asunto: Infraestructura técnica para sociedades-IA, RFCs publicados + listos para citar

Estimado/a [nombre del asesor],

Me presento: soy Nazareno Clemente, autor de las RFCs y la infraestructura publicada en ar-agents.ar.

Después del anuncio del Min. Sturzenegger del 28-abr-2026, dediqué el mes a publicar la infraestructura técnica que un régimen de sociedades-IA necesita para ser operativizable. El resultado:

· 6 RFCs (responsabilidad civil, descubrimiento, reciprocidad cross-jurisdiccional, log operativo), listos para citar por referencia en el articulado de la ley.
· Especificación normativa del log con vectores de conformidad deterministas. Cualquier biblioteca pasa o no pasa los vectores; sin ambigüedad.
· Certificador público que score 0-100 cualquier URL en 10 segundos contra las RFCs.
· Implementación de referencia (open-source) que se auto-certifica 100/100.
· Plantilla deployable + wizard de auto-incorporación, facilita el cumplimiento técnico para operadores.

Todo MIT + CC-BY-4.0. No tengo costo de consultoría para este tipo de conversaciones; el trabajo está hecho + el código es público.

Adjunto la síntesis técnica de 10 minutos para legisladores: ar-agents.ar/legislacion

Quedo disponible para una reunión técnica si encuentran útil el trabajo. Cualquier crítica al diseño es bienvenida vía GitHub Discussions; el proceso es público.

Saludos,
Nazareno Clemente
naza@naza.ar
Monte Grande, BA`,
    notes: "Best for: cold outreach to ministerial staff. Argentine Spanish, formal but not stiff. Lead with credentials (CUIT) + the work. Single ask at the end (meeting). Attach NOTHING, link out.",
  },
  {
    id: "email-2-press-international",
    audience: "email-journalist",
    title: "Email · international journalist (English)",
    body: `Subject: Argentina's proposed AI-corporation regime, published open-source infrastructure

Dear [Journalist Name],

I'm writing because you covered [recent piece by them, paste link here].

Argentina announced an "AI corporation" (sociedad-IA) regime on April 28, 2026. I'm not a government employee; I'm a Buenos Aires-based engineer who decided not to wait for the law text and instead published the technical infrastructure such a regime would need.

The result is six RFCs + an open-source reference implementation at ar-agents.ar:

1. RFC-001, Three-layer civil-liability framework (operator / AI corporation / model provider).
2. RFC-002, Discovery via /.well-known/agents.json. No central registry.
3. RFC-003, Portable envelope for cross-jurisdictional reciprocity (AR ↔ Wyoming DAO ↔ MIDAO ↔ Estonia OÜ).
4. RFC-004, Normative wire format for the operational log every AI corporation must keep. 7 frozen conformance vectors with hex-exact HMAC values.

There's a public certifier at /certifier that scores any URL 0-100 against RFC-002 + RFC-004 in seconds. The reference implementation self-certifies at 100/100.

Why this might matter for international coverage:

· It's the first concrete technical scaffolding for an AI-agent legal personhood regime, with versioned + frozen specs that legislation can cite by reference.
· It's jurisdiction-agnostic, Wyoming, Marshall Islands, Estonia, Delaware could adopt the same RFCs with one-line legislative cites.
· It's MIT + CC-BY-4.0. No vendor lock-in.

English synthesis at: ar-agents.ar/en/legislation
Spanish (for AR legislators) at: ar-agents.ar/legislacion

Happy to be a technical source on this. CV/links on request.

Best,
Nazareno Clemente
naza@naza.ar`,
    notes: "Best for: international press. English. Lead with their recent work (personalize). The 'jurisdiction-agnostic' angle is the international hook.",
  },
  {
    id: "email-3-regulator-aaip",
    audience: "email-regulator",
    title: "Email · AAIP / data-protection regulator",
    body: `Asunto: Especificación abierta del log operativo para sociedades-IA, implicancias en Ley 25.326

Estimado/a [nombre],

Le escribo en relación con el anuncio del régimen de sociedades-IA del 28-abr-2026 y su intersección con la Ley 25.326 de protección de datos personales.

Publiqué una especificación normativa abierta del log operativo que toda sociedad-IA debería mantener (RFC-004, ar-agents.ar/rfcs/004). El documento toma posiciones explícitas sobre:

· Mínimo de retención: 180 días (suficiente para chargebacks + reclamos operativos típicos).
· Máximo de retención: 5 años (cobertura prescripción fiscal AFIP); después debe purgarse o re-firmarse.
· Campos prohibidos en el log: contraseñas, claves privadas, tokens, API keys, la biblioteca de referencia los scrubea antes de escribir.
· Derecho de borrado (art. 16 Ley 25.326): el RFC v1.1 prevé un campo retentionClass = "privacy-erased" donde el contenido se reemplaza por null pero metadata + HMAC se preservan para integridad de cadena.

El diseño busca explícitamente reconciliar la auditabilidad regulatoria con los derechos de protección de datos. La discusión pública está abierta en github.com/ar-agents/ar-agents/discussions.

Si encuentran útil dialogar sobre el diseño desde la perspectiva de AAIP, quedo a disposición. Toda crítica que mejore el spec beneficia a cualquier operador futuro.

Saludos,
Nazareno Clemente
naza@naza.ar`,
    notes: "Best for: AAIP staff or analogous data-protection lawyers. Argentine Spanish. Demonstrate that you've already thought about Ley 25.326, that establishes credibility instantly with this audience.",
  },
];

const AUDIENCE_LABEL: Record<Snippet["audience"], string> = {
  twitter: "Twitter / X",
  linkedin: "LinkedIn",
  "email-asesor": "Email · ministry / asesor",
  "email-journalist": "Email · journalist",
  "email-regulator": "Email · regulator",
};

const AUDIENCE_COLOR: Record<Snippet["audience"], string> = {
  twitter: "#1da1f2",
  linkedin: "#0077b5",
  "email-asesor": "#22c55e",
  "email-journalist": "#a855f7",
  "email-regulator": "#eab308",
};

export function ShareClient() {
  const [active, setActive] = useState<Snippet["audience"] | "all">("all");
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = active === "all" ? SNIPPETS : SNIPPETS.filter((s) => s.audience === active);

  async function copy(body: string, id: string) {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <main
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "48px 24px 96px",
        color: "var(--text-body)",
        fontSize: 15,
        lineHeight: 1.6,
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 8,
          }}
        >
          /share · copy-paste · cc-by-4.0
        </p>
        <h1
          style={{
            fontSize: 32,
            lineHeight: 1.15,
            fontWeight: 500,
            color: "var(--text-strong)",
            marginBottom: 12,
            letterSpacing: "-0.01em",
          }}
        >
          Prepared social + email templates.
        </h1>
        <p style={{ fontSize: 16 }}>
          Copy-paste-ready drafts for sharing ar-agents. Twitter, LinkedIn,
          and three email templates (ministry asesor, journalist,
          regulator). CC-BY-4.0, use freely, modify, attribute the spec
          if you keep large chunks.
        </p>
      </header>

      {/* Audience filter */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
        <FilterPill label="All" active={active === "all"} onClick={() => setActive("all")} />
        {(Object.keys(AUDIENCE_LABEL) as Snippet["audience"][]).map((a) => (
          <FilterPill
            key={a}
            label={AUDIENCE_LABEL[a]}
            active={active === a}
            color={AUDIENCE_COLOR[a]}
            onClick={() => setActive(a)}
          />
        ))}
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {filtered.map((s) => (
          <li
            key={s.id}
            style={{
              padding: 18,
              background: "var(--bg-tint)",
              borderRadius: 8,
              boxShadow: "var(--card-shadow)",
              marginBottom: 14,
              borderLeft: `3px solid ${AUDIENCE_COLOR[s.audience]}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-strong)" }}>
                  {s.title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    color: AUDIENCE_COLOR[s.audience],
                    marginTop: 2,
                    textTransform: "uppercase",
                  }}
                >
                  {AUDIENCE_LABEL[s.audience]}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copy(s.body, s.id)}
                style={{
                  background: "var(--accent)",
                  color: "var(--bg)",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {copied === s.id ? "Copied" : "Copy"}
              </button>
            </div>
            <pre
              style={{
                marginTop: 12,
                marginBottom: 8,
                padding: 12,
                background: "var(--bg)",
                borderRadius: 6,
                fontSize: 13,
                fontFamily: "var(--font-geist-sans), Arial, sans-serif",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "var(--text-body)",
              }}
            >
              {s.body}
            </pre>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              <strong>Notes:</strong> {s.notes}
            </p>
          </li>
        ))}
      </ul>

      <footer
        style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: "1px solid var(--border-subtle)",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        ar-agents.ar ·{" "}
        <Link href="/" style={linkSty}>/</Link>{" · "}
        <Link href="/auditor" style={linkSty}>/auditor</Link>{" · "}
        <Link href="/legislacion" style={linkSty}>/legislación</Link>{" · "}
        <Link href="/glossary" style={linkSty}>/glossary</Link>
      </footer>
    </main>
  );
}

function FilterPill({
  label,
  active,
  color = "#737373",
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? color : "var(--bg-tint)",
        color: active ? "var(--bg)" : "var(--text-body)",
        border: `1px solid ${active ? color : "var(--border-subtle)"}`,
        padding: "5px 12px",
        borderRadius: 16,
        fontSize: 12,
        cursor: "pointer",
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};
