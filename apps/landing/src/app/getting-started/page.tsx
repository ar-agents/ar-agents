import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "/getting-started · 5 minutes from zero to operating",
  description:
    "Three onboarding paths for ar-agents: try-without-installing (30s), human wizard for full incorporation (~10 min), TypeScript SDK for programmatic agents. Pick one.",
  alternates: { canonical: "https://ar-agents.ar/getting-started" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_CARD =
  "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px";

const PATHS = [
  {
    id: "try",
    label: "Try without installing",
    time: "30 segundos",
    audience: "any visitor · regulator · journalist",
    color: "#0a72ef",
    bg: "#ebf5ff",
    description:
      "Para ver una sociedad-IA argentina operando ahora mismo, sin setup, sin cuenta, sin cert.",
    steps: [
      {
        title: "Open /play",
        body: "12 tools, streaming via Vercel AI Gateway, agent corre Claude Sonnet 4.6.",
        link: "/play",
      },
      {
        title: "Pick a scenario",
        body: 'Hacé click en "01 · cobro B2B", agente valida CUIT, consulta padrón, chequea BCRA, crea suscripción MP, manda WhatsApp.',
      },
      {
        title: "Watch the audit log",
        body: "Cada tool call queda firmado HMAC-SHA256 en la sidebar. Hacé click en 'ver dashboard ↗' para el timeline forense completo.",
        link: "/dashboard",
      },
    ],
  },
  {
    id: "incorporate",
    label: "Incorporar una sociedad-IA",
    time: "~10 minutos + 5-10 días hábiles (ARCA + IGJ)",
    audience: "founder · operador · accountant",
    color: "#22c55e",
    bg: "#ecfdf5",
    description:
      "Para constituir una empresa argentina operada por IA, hoy. SAS estándar mientras la ley sociedades-IA no esté sancionada, el código pre-cableado migra el día 1.",
    steps: [
      {
        title: "Abrir el wizard",
        body: "Completás denominación + tipo + capital + objeto + email contacto. El pre-flight de IGJ corre en vivo (mismas reglas que validate_igj_inscription).",
        link: "/incorporar",
      },
      {
        title: "Descargar los 4 archivos",
        body: "package.json, lib/agent.ts, .env.example, README.md.",
      },
      {
        title: "Click 'Deploy en Vercel'",
        body: "Clona apps/sociedad-ia-starter directo. Vercel auto-injecta los env-var slots.",
      },
      {
        title: "Cargar credenciales reales",
        body: "AFIP cert (5-10 días desde ARCA → Clave Fiscal), MP token (1 día developers.mercadopago.com), Meta WhatsApp (10-15 días business verification).",
      },
      {
        title: "Inscripción IGJ vía TAD",
        body: "Solicitar inscripción de la SAS. Tu agente queda online apenas el cert + IGJ + MP estén wired.",
      },
    ],
  },
  {
    id: "sdk",
    label: "Programmatic agent",
    time: "~5 minutos",
    audience: "developer · external orchestrator · USA-LLC",
    color: "#7928ca",
    bg: "#f5edfd",
    description:
      "Para que un agente externo (USA-LLC, ChatGPT, Claude tool, custom pipeline) auto-incorpore programáticamente.",
    steps: [
      {
        title: "Install",
        body: "pnpm add @ar-agents/incorporate (zero deps, ~4KB, MIT, SLSA-provenanced)",
      },
      {
        title: "Call incorporate()",
        body: 'await incorporate({ denominacion: "ACME-AI SAS", tipo: "SOCIEDAD-IA", capitalSocial: 1, objeto: "..." })',
        link: "/sdk",
      },
      {
        title: "Materialize the 4 files",
        body: "Object.entries(result.config).map(([path, contents]) => writeFile(path, contents))",
      },
      {
        title: "Deploy + verify",
        body: "result.deploy.oneClickUrl + result.audit.dashboardUrl. Pasá el sessionId para chainear el forensic timeline.",
      },
    ],
  },
];

export default function GettingStartedPage() {
  return (
    <DocShell
      eyebrow="getting-started · pick one"
      title="Tres caminos para empezar"
      subtitle="Cada path está optimizado para una audiencia diferente. Si dudás, empezá por /play (30 segundos, sin setup, sin compromiso). Si ya querés ir a producción, /incorporar es el wizard humano. Si sos un agente, andá directo al SDK."
    >
      <DocBlock>
        <DocP>
          Las 3 paths comparten backend: el mismo{" "}
          <DocCode>/api/auto-incorporate</DocCode>, el mismo audit log con
          HMAC, el mismo template{" "}
          <DocCode>apps/sociedad-ia-starter</DocCode>. Lo que cambia es el
          surface por el cual entrás. Podés combinarlas, empezar con{" "}
          <DocCode>/play</DocCode>, ir a <DocCode>/incorporar</DocCode>{" "}
          cuando sepas qué configurar, terminar usando el SDK para
          orchestration recurrente.
        </DocP>
      </DocBlock>

      <div style={{ display: "grid", gap: 24 }}>
        {PATHS.map((path) => (
          <article
            key={path.id}
            id={path.id}
            style={{
              background: "var(--bg)",
              padding: 24,
              borderRadius: 8,
              boxShadow: SHADOW_CARD,
            }}
          >
            <header
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  color: path.color,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                  background: path.bg,
                  padding: "2px 10px",
                  borderRadius: 9999,
                }}
              >
                {path.audience}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  color: "var(--text-muted)",
                }}
              >
                {path.time}
              </span>
            </header>
            <h2
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: "var(--text)",
                margin: "0 0 8px",
                letterSpacing: "-0.96px",
                lineHeight: 1.2,
              }}
            >
              {path.label}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-body)",
                lineHeight: 1.55,
                margin: "0 0 16px",
              }}
            >
              {path.description}
            </p>
            <ol
              style={{
                paddingLeft: 0,
                listStyle: "none",
                display: "grid",
                gap: 8,
                margin: 0,
              }}
            >
              {path.steps.map((step, i) => (
                <li
                  key={i}
                  style={{
                    background: "var(--bg-tint)",
                    padding: "10px 14px",
                    borderRadius: 6,
                    boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--text-body)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        fontSize: 11,
                        fontFamily: FONT_MONO,
                        color: path.color,
                        fontWeight: 600,
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <strong style={{ color: "var(--text)", fontSize: 14 }}>
                      {step.title}
                    </strong>
                    {"link" in step && step.link && (
                      <a
                        href={step.link}
                        style={{
                          marginLeft: "auto",
                          fontSize: 11,
                          color: path.color,
                          fontFamily: FONT_MONO,
                          textDecoration: "none",
                        }}
                      >
                        ir →
                      </a>
                    )}
                  </div>
                  <div style={{ paddingLeft: 24 }}>{step.body}</div>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>

      <DocH2>Y después?</DocH2>
      <DocP>
        Una vez tengas el surface básico operando, el siguiente layer es
        compliance + observability:
      </DocP>
      <ul
        style={{
          paddingLeft: 24,
          fontSize: 14,
          lineHeight: 1.7,
          color: "var(--text-body)",
        }}
      >
        <li>
          <a href="/dashboard" style={{ color: "var(--accent)" }}>
            /dashboard/{`{sessionId}`}
          </a>:{" "}
        forensic timeline live (SSE updates).
        </li>
        <li>
          <a href="/verify" style={{ color: "var(--accent)" }}>
            /verify
          </a>:{" "}
        paste a session id, get an independent HMAC verification
          report.
        </li>
        <li>
          <a href="/examples#19" style={{ color: "var(--accent)" }}>
            Cookbook recipe 19
          </a>:{" "}
        daily compliance digest cron job.
        </li>
        <li>
          <a href="/examples#20" style={{ color: "var(--accent)" }}>
            Cookbook recipe 20
          </a>:{" "}
        multi-tenant marketplace pattern.
        </li>
        <li>
          <a href="/architecture" style={{ color: "var(--accent)" }}>
            /architecture
          </a>:{" "}
        la arquitectura full + Edge Runtime contract.
        </li>
        <li>
          <a href="/security" style={{ color: "var(--accent)" }}>
            /security
          </a>:{" "}
        threat model con 18 amenazas explícitas.
        </li>
      </ul>

      <DocH2>Need help?</DocH2>
      <DocP>
        <a href="/faq" style={{ color: "var(--accent)" }}>
          /faq
        </a>{" "}
        cubre 21 preguntas across 5 audiencias. Si no aparece la tuya,
        abrí un{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/issues/new?labels=question&template=question.md"
          style={{ color: "var(--accent)" }}
        >
          issue
        </a>{" "}
        o mandá un email a{" "}
        <a href="mailto:naza@naza.ar" style={{ color: "var(--accent)" }}>
          naza@naza.ar
        </a>:{" "}
      primera respuesta &lt;48hs.
      </DocP>
    </DocShell>
  );
}
