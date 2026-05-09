import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "/walkthrough · 90 seconds, 5 steps, the whole demo flow",
  description:
    "Step-by-step annotated walkthrough of the full /play → /dashboard → /verify forensic flow. 5 numbered steps, each with what to do + what to look for + the URL it covers. Print-friendly.",
  alternates: { canonical: "https://ar-agents.vercel.app/walkthrough" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";
const SHADOW_CARD =
  "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px";

interface Step {
  num: number;
  title: string;
  url: string;
  duration: string;
  whatToDo: string;
  whatToLookFor: string;
  whyItMatters: string;
  proofRefs: { label: string; href: string }[];
}

const STEPS: Step[] = [
  {
    num: 1,
    title: "Open the live agent",
    url: "https://ar-agents.vercel.app/play",
    duration: "5 seg",
    whatToDo:
      'Hacé click en "/play" desde la home, o pegá la URL directo. La página carga sin loading spinners porque server-rendered.',
    whatToLookFor:
      "El audit-log pane (derecha) muestra una pill: vercel-kv (azul) si KV está provisionado, in-memory (gris) si no. Y un session id de 32 chars en el footer — es tu sessionId para el resto del walkthrough.",
    whyItMatters:
      "El operating-mode pill es la diferencia entre 'demo bonita' y 'forensic primitive operativo'. Vercel-kv = persistencia cross-instance + retención 7 días. In-memory = solo dura la cold-start window de Edge.",
    proofRefs: [
      { label: "/play", href: "/play" },
      { label: "/architecture/audit-log § 4", href: "/architecture/audit-log#4" },
    ],
  },
  {
    num: 2,
    title: "Run the cobro B2B scenario",
    url: "https://ar-agents.vercel.app/play",
    duration: "20 seg",
    whatToDo:
      "Hacé click en el botón 'cobro B2B'. El agente recibe: 'Cobrale $75.000 a Acme SRL...' y arranca la cadena de tool calls.",
    whatToLookFor:
      "El audit log empieza a llenarse en tiempo real con cada tool call: validate_cuit (algoritmo, ~50ms), lookup_cuit_afip (mocked, ~1.2s), lookup_credit_situation (mocked BCRA), mp_create_subscription (mocked, devuelve init_point), send_whatsapp_text. Cada entry tiene su pill de governance + suffix HMAC truncado.",
    whyItMatters:
      "Una sociedad-IA no es un chatbot. Es un agente que ejecuta tools reales contra APIs externas. El audit log es la prueba de que cada paso pasó, en qué orden, con qué inputs/outputs.",
    proofRefs: [
      { label: "/api/play tools surface", href: "/api/discovery" },
      { label: "RFC-001 § 3.2 (HITL)", href: "/rfcs/001#3.2" },
    ],
  },
  {
    num: 3,
    title: "Open the forensic dashboard",
    url: "https://ar-agents.vercel.app/dashboard/{sessionId}",
    duration: "10 seg",
    whatToDo:
      'En el header del audit-log pane hacé click "ver dashboard ↗". Se abre /dashboard/{sessionId} con el timeline forense completo.',
    whatToLookFor:
      "Un headline grande con el status — 'X de Y entradas verificadas · log limpio' (azul) o 'N entradas tampered' (rojo). Strip de métricas: entradas, verificadas, tampered, backend, hmac. Timeline newest-first con cada entry expandible para ver input/output JSON. Indicador 'live · escuchando nuevas entradas' arriba — la página actualiza vía SSE en tiempo real.",
    whyItMatters:
      "Esta es la página que un asesor de Sturzenegger screenshots para un memo. Server-rendered → grep-able + print-able. JSON-LD Dataset embedded → un LLM scrapeando entiende qué es la página. OG image dinámico → cuando la URL se comparte en WhatsApp/Slack, el preview muestra el verification status.",
    proofRefs: [
      { label: "/dashboard sample", href: "/dashboard/4f50ebf2-94ec-4c75-b94a-6e8e1f54f5bc" },
      { label: "/architecture/audit-log § 5", href: "/architecture/audit-log#5" },
    ],
  },
  {
    num: 4,
    title: "Verify independently",
    url: "https://ar-agents.vercel.app/verify",
    duration: "15 seg",
    whatToDo:
      "Andá a /verify, pegá tu sessionId, click 'Verificar →'. El servidor recomputa el HMAC-SHA256 de cada entry server-side y devuelve el report.",
    whatToLookFor:
      "Headline: 'X de Y entradas verificadas · log limpio' en azul, o 'N entradas tampered' en rojo si algo está roto. Métricas: entradas, verificadas, tampered, backend, hmac.wired. Links rápidos al dashboard + JSON crudo.",
    whyItMatters:
      "El paso clave de RFC-001 § 9.2: cualquier tercero (regulador, periodista, otro agente) puede verificar el log sin necesidad de coordinación con el operador, sin acceso al secret. La probative-value claim necesita que esto exista + sea trivial de usar.",
    proofRefs: [
      { label: "/verify", href: "/verify" },
      { label: "RFC-001 § 9.2", href: "/rfcs/001#9.2" },
    ],
  },
  {
    num: 5,
    title: "Watch the HMAC catch tampering",
    url: "https://ar-agents.vercel.app/api/play/tamper-demo",
    duration: "10 seg",
    whatToDo:
      "POST a /api/play/tamper-demo (o usá curl: `curl -X POST .../api/play/tamper-demo -d '{\"mutation\":\"input\"}'`). Devuelve un original entry firmado + una versión mutada + el verification result de las dos.",
    whatToLookFor:
      "originalVerified: true. tamperedVerified: false. Es decir: la versión original verifica, la mutada no. Mecánica, no opinable.",
    whyItMatters:
      "El momento. El argumento conceptual de 'el log es probatorio' es trivial de hacer; el momento donde se vuelve real es viendo que cualquier edit produce false. Sin esto, el audit log es una feature de UI; con esto, es una primitiva forense.",
    proofRefs: [
      { label: "/api/play/tamper-demo", href: "/api/play/tamper-demo" },
      { label: "/architecture/audit-log § 8", href: "/architecture/audit-log#8" },
    ],
  },
];

export default function WalkthroughPage() {
  return (
    <DocShell
      eyebrow="/arg · walkthrough · 90 segundos"
      title="El demo completo, 5 pasos, anotados."
      subtitle="Para reguladores, periodistas, asesores que quieren entender el toolkit sin instalar nada. Cada paso: qué hacer, qué mirar, por qué importa, dónde está el código. Imprimible. Compartible. ~90 segundos end-to-end."
    >
      <DocBlock>
        <DocP>
          Esta página es la versión walkthrough del{" "}
          <a href="/getting-started" style={{ color: "var(--accent)" }}>
            /getting-started
          </a>{" "}
          path #1 ("try without installing"), pero con el detalle que un
          asesor que está escribiendo un memo necesita ver. Cada paso
          enlaza al artefacto que prueba la afirmación.
        </DocP>
      </DocBlock>

      <DocH2>The flow</DocH2>
      <div style={{ display: "grid", gap: 16 }}>
        {STEPS.map((step) => (
          <article
            key={step.num}
            style={{
              background: "var(--bg)",
              padding: 18,
              borderRadius: 8,
              boxShadow: SHADOW_CARD,
            }}
          >
            <header
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  background: "#171717",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: FONT_MONO,
                  fontSize: 14,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {step.num}
              </span>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.88px",
                  color: "var(--text)",
                  margin: 0,
                  flex: 1,
                  minWidth: 200,
                }}
              >
                {step.title}
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {step.duration}
              </span>
            </header>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr)",
                gap: 14,
                marginTop: 12,
              }}
            >
              <Box label="qué hacer" body={step.whatToDo} tone="action" />
              <Box label="qué mirar" body={step.whatToLookFor} tone="observe" />
              <Box label="por qué importa" body={step.whyItMatters} tone="why" />
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--bg-tint)",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginRight: 4,
                }}
              >
                proof refs:
              </span>
              {step.proofRefs.map((r) => (
                <a
                  key={r.href}
                  href={r.href}
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
                  {r.label}
                </a>
              ))}
              <code
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  color: "var(--text-muted)",
                  alignSelf: "center",
                  wordBreak: "break-all",
                }}
              >
                {step.url}
              </code>
            </div>
          </article>
        ))}
      </div>

      <DocH2>What you'll have proven, end-to-end</DocH2>
      <ol style={listStyle}>
        <Li>
          Una sociedad-IA argentina ejecuta operaciones reales contra
          APIs externas (paso 2).
        </Li>
        <Li>
          Cada operación queda en un audit log persistido + accesible
          (paso 3).
        </Li>
        <Li>
          Cualquier tercero puede verificar el log sin coordinación con
          el operador (paso 4).
        </Li>
        <Li>
          La verificación es mecánica — tampering produce false (paso 5).
        </Li>
      </ol>
      <DocP>
        Eso es el contrato completo de RFC-001 § 9.2 hecho operativo. Si
        un regulador quiere extender el regime sociedad-IA a producción,
        este flow es el threshold mínimo de pruebas que cualquier
        operador debería poder pasar.
      </DocP>

      <DocH2>For asesores escribiendo el memo</DocH2>
      <DocP>
        Una línea citable:{" "}
        <em>
          La implementación de referencia open-source (ar-agents.vercel.app)
          permite a un regulador verificar la probative-value claim del
          audit log en menos de 90 segundos, sin instalar nada, sin
          cuenta, sin coordinar con el operador. Cinco URLs, cinco
          asserts mecánicos.
        </em>
      </DocP>

      <DocH2>For developers wanting to copy the pattern</DocH2>
      <DocP>
        El audit-log + HMAC + verify primitive vive en{" "}
        <DocCode>apps/landing/src/lib/audit.ts</DocCode> (~120 líneas).
        El{" "}
        <a href="/architecture/audit-log" style={{ color: "var(--accent)" }}>
          /architecture/audit-log
        </a>{" "}
        deep-dive cubre el por qué de cada decisión. La{" "}
        <a href="/sdk" style={{ color: "var(--accent)" }}>
          @ar-agents/incorporate
        </a>{" "}
        package wrapea todo el flujo en un client de ~4KB.
      </DocP>
    </DocShell>
  );
}

function Box({
  label,
  body,
  tone,
}: {
  label: string;
  body: string;
  tone: "action" | "observe" | "why";
}) {
  const colors: Record<typeof tone, { fg: string; bg: string }> = {
    action: { fg: "#0a72ef", bg: "#ebf5ff" }, // develop blue
    observe: { fg: "#7928ca", bg: "#f5edfd" }, // console purple
    why: { fg: "#666666", bg: "#fafafa" },
  };
  const c = colors[tone];
  return (
    <div
      style={{
        background: "var(--bg)",
        padding: "12px 14px",
        borderRadius: 6,
        boxShadow: SHADOW_BORDER,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: FONT_MONO,
          color: c.fg,
          background: c.bg,
          padding: "1px 8px",
          borderRadius: 9999,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          display: "inline-block",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
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
