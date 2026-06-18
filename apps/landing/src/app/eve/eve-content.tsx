"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLang } from "../i18n";
import { EveDemo } from "./eve-demo";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const REPO = "https://github.com/ar-agents/ar-agents";
const APP = `${REPO}/tree/main/apps/incorporate-agent`;
const STARTER = `${REPO}/tree/main/apps/sociedad-ia-starter`;

// Page-specific bilingual copy. Kept local (not in the shared i18n dict) so
// this launch page owns its own strings. Code blocks stay identical across
// languages: code is code. Only prose, headings, buttons and the demo chat
// translate.
const COPY = {
  en: {
    eyebrow_hero: "Built with eve",
    h1: "An agent that incorporates automated companies in Argentina",
    sub: "eve is Vercel's open-source agent framework. ar-agents already speaks the protocol it connects over, so this agent incorporates a real Argentine company, and pauses for a human to approve the one step it must not take alone.",
    cta_demo: "Run the demo",
    cta_source: "Source",
    context_a: "A Sociedad Automatizada is the AI-operated company in Argentina's draft companies law. The human administrator stays liable and cannot delegate supervision (art. 102), and the name must carry the word ",
    context_b: " (art. 14).",
    demo_caption: "A scripted replay of the real run. Approve to continue, reject and nothing is constituted.",
    eyebrow_hitl: "human-in-the-loop",
    h2_hitl: "Human approval in one line",
    body_hitl: "Art. 102 makes the human administrator liable for what the AI does, and bars delegating the supervision duty. So the agent validates the CUIT and drafts the plan on its own. The one step it cannot take alone, constituting the company, is gated.",
    caption_hitl: "eve parks the run durably until a person answers. That pause is the legal requirement, expressed as configuration.",
    eyebrow_glue: "the hard part",
    h2_glue: "The hard part of an agent is the data",
    body_glue: "The hard part of building this agent was never the agent. It was the data: reaching AFIP, Mercado Pago, the banks, validating a CUIT, without juggling certificates and tokens. ar-agents is that layer for Argentina, 235 tools as one hosted MCP server, zero credentials. eve consumes it in a single connection.",
    caption_glue: "eve discovers the remote tools, hands them to the model, and brokers the auth. The model never sees the URL or the credentials. CUIT validation, padrón lookups, fiscal math and the incorporation endpoint all arrive through this one file.",
    eyebrow_fs: "filesystem-first",
    h2_fs: "The whole agent is a directory",
    body_fs: "In eve, a file's name and place in the tree are its definition. There is no wiring file. eve discovers the directory and compiles it into an app that runs on Vercel Functions.",
    eyebrow_erase: "no boilerplate",
    h2_erase: "We built the same agent twice",
    body_erase: "The starter is the same domain on the raw AI SDK: you hand-roll the routes. The loop is a route, the cron job is a route, the webhook is a route, and the state, retries and durability are yours. On eve each concern is a file, and the loop, retries, durability and approvals come built in.",
    eyebrow_tested: "tested",
    h2_tested: "The guarantee is an eval",
    body_tested: "That the agent never constitutes a company on its own is not a hope. It is an eval that runs with eve eval, locally or against the deployed agent. If a prompt edit or a model swap ever lets it skip the human, the eval fails before a user would.",
    eyebrow_map: "the mapping",
    h2_map: "How it uses eve",
    eyebrow_run: "run it",
    h2_run: "Clone it and go",
    body_run: "eve is in public preview and needs Node 24. The model runs through the Vercel AI Gateway, so you bring one key.",
    cta_read: "Read the source",
    cta_docs: "ar-agents docs",
    disclaimer: "The regime is a draft bill in the Senate, not law yet. This is a reference implementation and a verifiable demo, not a registered company.",
  },
  es: {
    eyebrow_hero: "Hecho con eve",
    h1: "Un agente que constituye sociedades automatizadas en Argentina",
    sub: "eve es el framework de agentes open source de Vercel. ar-agents ya habla el protocolo con el que se conecta, así que este agente constituye una empresa argentina real, y se frena para que un humano apruebe el único paso que no debe dar solo.",
    cta_demo: "Probá la demo",
    cta_source: "Código",
    context_a: "Una Sociedad Automatizada es la empresa operada por IA del anteproyecto de ley argentino. El administrador humano sigue siendo responsable y no puede delegar la supervisión (art. 102), y la denominación tiene que incluir la palabra ",
    context_b: " (art. 14).",
    demo_caption: "Un replay scripteado del run real. Aprobá para continuar, rechazá y no se constituye nada.",
    eyebrow_hitl: "human-in-the-loop",
    h2_hitl: "La aprobación humana en una línea",
    body_hitl: "El art. 102 hace responsable al administrador humano de lo que hace la IA, y prohíbe delegar el deber de supervisión. Así que el agente valida el CUIT y arma el plan solo. El único paso que no puede dar solo, constituir la empresa, queda gateado.",
    caption_hitl: "eve frena el run de forma durable hasta que una persona responde. Esa pausa es el requisito legal, expresado como configuración.",
    eyebrow_glue: "lo difícil",
    h2_glue: "Lo difícil de un agente son los datos",
    body_glue: "Lo difícil de construir este agente nunca fue el agente. Fueron los datos: llegar a AFIP, Mercado Pago, los bancos, validar un CUIT, sin malabarear certificados y tokens. ar-agents es esa capa para Argentina: 235 tools como un MCP server hosteado, cero credenciales. eve la consume en una sola conexión.",
    caption_glue: "eve descubre las tools remotas, se las da al modelo y maneja la auth. El modelo nunca ve la URL ni las credenciales. La validación de CUIT, los lookups de padrón, el cálculo fiscal y el endpoint de constitución llegan todos por este único archivo.",
    eyebrow_fs: "filesystem-first",
    h2_fs: "Todo el agente es un directorio",
    body_fs: "En eve, el nombre de un archivo y su lugar en el árbol son su definición. No hay archivo de wiring. eve descubre el directorio y lo compila en una app que corre sobre Vercel Functions.",
    eyebrow_erase: "sin boilerplate",
    h2_erase: "Construimos el mismo agente dos veces",
    body_erase: "El starter es el mismo dominio sobre el AI SDK crudo: hand-rolleás las rutas. El loop es una ruta, el cron es una ruta, el webhook es una ruta, y el estado, los retries y la durabilidad son tuyos. En eve cada cosa es un archivo, y el loop, los retries, la durabilidad y las aprobaciones vienen incluidos.",
    eyebrow_tested: "testeado",
    h2_tested: "La garantía es un eval",
    body_tested: "Que el agente nunca constituya una empresa solo no es un deseo. Es un eval que corre con eve eval, local o contra el agente deployado. Si un cambio de prompt o de modelo lo dejara saltear al humano, el eval falla antes que un usuario.",
    eyebrow_map: "el mapeo",
    h2_map: "Cómo usa eve",
    eyebrow_run: "corrélo",
    h2_run: "Clonalo y listo",
    body_run: "eve está en public preview y necesita Node 24. El modelo corre por el Vercel AI Gateway, así que llevás una sola key.",
    cta_read: "Leé el código",
    cta_docs: "docs de ar-agents",
    disclaimer: "El régimen es un anteproyecto en el Senado, todavía no es ley. Esto es una implementación de referencia y una demo verificable, no una empresa registrada.",
  },
} as const;

// --- primitives, tuned to the site's Geist + CSS-var design system ---

function Section({
  children,
  style,
  id,
}: {
  children: ReactNode;
  style?: CSSProperties;
  id?: string;
}) {
  return (
    <section
      id={id}
      style={{ maxWidth: 880, margin: "0 auto", padding: "0 24px", ...style }}
    >
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontFamily: FONT_MONO,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        color: "var(--accent)",
        fontWeight: 600,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      style={{
        fontSize: "clamp(24px, 4vw, 32px)",
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: "-0.03em",
        margin: 0,
        color: "var(--text)",
        scrollMarginTop: 80,
      }}
    >
      {children}
    </h2>
  );
}

function P({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p
      style={{
        fontSize: 17,
        lineHeight: 1.65,
        color: "var(--text-body)",
        margin: 0,
        maxWidth: 660,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code style={{ fontFamily: FONT_MONO, color: "var(--accent)", fontSize: "0.92em" }}>
      {children}
    </code>
  );
}

function CodeWindow({ file, children }: { file: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg-tint)",
        borderRadius: 10,
        boxShadow: "var(--card-shadow)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          boxShadow: "inset 0 -1px 0 var(--border-color)",
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11.5,
            color: "var(--text-muted)",
            letterSpacing: "0.02em",
          }}
        >
          {file}
        </span>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "16px 18px",
          overflowX: "auto",
          fontFamily: FONT_MONO,
          fontSize: 13,
          lineHeight: 1.7,
          color: "var(--text)",
        }}
      >
        {children}
      </pre>
    </div>
  );
}

const cm: CSSProperties = { color: "var(--text-muted)" };
const kw: CSSProperties = { color: "var(--text-body)" };
const hl: CSSProperties = {
  color: "var(--accent)",
  fontWeight: 600,
  background: "var(--accent-bg)",
  borderRadius: 3,
  padding: "1px 4px",
  margin: "0 -4px",
};
const str: CSSProperties = { color: "var(--accent)" };

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 18px",
        background: "var(--primary-bg)",
        color: "var(--primary-text)",
        borderRadius: 7,
        fontSize: 14.5,
        fontWeight: 500,
        textDecoration: "none",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </a>
  );
}

function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 16px",
        background: "transparent",
        color: "var(--text)",
        borderRadius: 7,
        fontSize: 14.5,
        fontWeight: 500,
        textDecoration: "none",
        boxShadow: "var(--shadow-ring-light)",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </a>
  );
}

const ArrowDown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
);
const ArrowOut = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M7 7h10v10" /></svg>
);

export function EveContent() {
  const { lang } = useLang();
  const c = COPY[lang];

  const uses: ReadonlyArray<readonly [string, ReactNode]> =
    lang === "es"
      ? [
          ["Conexión (MCP)", <>
            <Mono>ar-agents.ar/api/mcp</Mono>. 235 tools argentinas, cero credenciales.
            eve habla MCP, así que conectarlo no necesitó tocar el SDK.
          </>],
          ["Tools", <>
            <Mono>incorporar_sociedad</Mono> y <Mono>registrar_decision</Mono>, un
            archivo TypeScript cada una.
          </>],
          ["Aprobaciones (HITL)", <>
            <Mono>needsApproval: always()</Mono> en el paso irreversible. El run se
            frena para un humano (art. 102).
          </>],
          ["Skills", <>
            Las reglas de la Sociedad Automatizada y los landmines de AFIP/ARCA, en
            markdown, cargados on demand.
          </>],
          ["Channels", <>
            <Mono>channels/eve.ts</Mono> con auth (local + OIDC de Vercel). El mismo
            agente vive en web hoy, y suma Slack o Cron con otro archivo.
          </>],
          ["Evals", <>
            Un test scoreado de que el run se frena a esperar aprobación en vez de
            constituir una empresa sin supervisión.
          </>],
          ["Ejecución durable", <>
            eve corre cada sesión sobre Vercel Workflow: el turno frenado sobrevive
            reinicios y redeploys, y retoma apenas una persona responde.
          </>],
        ]
      : [
          ["Connection (MCP)", <>
            <Mono>ar-agents.ar/api/mcp</Mono>. 235 Argentine tools, zero credentials.
            eve speaks MCP, so connecting took no SDK change.
          </>],
          ["Tools", <>
            <Mono>incorporar_sociedad</Mono> and <Mono>registrar_decision</Mono>, one
            TypeScript file each.
          </>],
          ["Approvals (HITL)", <>
            <Mono>needsApproval: always()</Mono> on the irreversible step. The run parks
            for a human (art. 102).
          </>],
          ["Skills", <>
            The Sociedad Automatizada rules and the AFIP/ARCA landmines, plain markdown,
            loaded on demand.
          </>],
          ["Channels", <>
            <Mono>channels/eve.ts</Mono> with auth (local + Vercel OIDC). The same agent
            lives on the web today, and adds Slack or Cron with one more file.
          </>],
          ["Evals", <>
            A scored test that the run pauses for approval instead of constituting a
            company unattended.
          </>],
          ["Durable execution", <>
            eve runs each session on Vercel Workflow: the parked turn survives restarts
            and redeploys, then resumes the moment a person answers.
          </>],
        ];

  return (
    <main
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        paddingBottom: 120,
        fontFamily: "var(--font-geist-sans), Arial, sans-serif",
      }}
    >
      {/* HERO */}
      <Section style={{ paddingTop: 72 }}>
        <Eyebrow>{c.eyebrow_hero}</Eyebrow>
        <h1
          style={{
            fontSize: "clamp(36px, 7vw, 60px)",
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: "-0.04em",
            margin: "20px 0 0",
            maxWidth: 780,
          }}
        >
          {c.h1}
        </h1>
        <P style={{ fontSize: 19, marginTop: 22, maxWidth: 680 }}>{c.sub}</P>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
          <PrimaryLink href="#demo">
            {c.cta_demo}
            <ArrowDown />
          </PrimaryLink>
          <GhostLink href={APP}>
            {c.cta_source}
            <ArrowOut />
          </GhostLink>
        </div>
      </Section>

      {/* CONTEXT */}
      <Section style={{ paddingTop: 28 }}>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--text-muted)",
            margin: 0,
            maxWidth: 660,
            paddingLeft: 14,
            boxShadow: "inset 2px 0 0 var(--border-color)",
          }}
        >
          {c.context_a}
          <span style={{ fontFamily: FONT_MONO }}>Automatizada</span>
          {c.context_b}
        </p>
      </Section>

      {/* DEMO */}
      <Section id="demo" style={{ paddingTop: 56 }}>
        {/* key={lang} remounts the demo on a language toggle for a clean reset. */}
        <EveDemo key={lang} />
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-muted)",
            margin: "12px 2px 0",
            fontFamily: FONT_MONO,
          }}
        >
          {c.demo_caption}
        </p>
      </Section>

      {/* ONE LINE */}
      <Section style={{ paddingTop: 96 }}>
        <Eyebrow>{c.eyebrow_hitl}</Eyebrow>
        <H2 id="approval">{c.h2_hitl}</H2>
        <P style={{ marginTop: 16, marginBottom: 28 }}>{c.body_hitl}</P>
        <CodeWindow file="agent/tools/incorporar_sociedad.ts">
          <span style={kw}>import</span> {"{ defineTool }"} <span style={kw}>from</span>{" "}
          <span style={str}>&quot;eve/tools&quot;</span>;{"\n"}
          <span style={kw}>import</span> {"{ always }"} <span style={kw}>from</span>{" "}
          <span style={str}>&quot;eve/tools/approval&quot;</span>;{"\n"}
          <span style={kw}>import</span> {"{ z }"} <span style={kw}>from</span>{" "}
          <span style={str}>&quot;zod&quot;</span>;{"\n\n"}
          <span style={kw}>export default</span> <span style={{ color: "var(--text)" }}>defineTool</span>({"{"}
          {"\n"}
          {"  "}description: <span style={cm}>&quot;Incorporate an Argentine company. Irreversible.&quot;</span>,{"\n"}
          {"  "}inputSchema: z.object({"{ denominacion, tipo, objeto, representante }"}),{"\n"}
          {"  "}<span style={hl}>needsApproval: always(),</span>{"\n"}
          {"  "}<span style={kw}>async</span> execute(input) {"{"} <span style={cm}>/* POST /api/auto-incorporate */</span> {"}"}{"\n"}
          {"}"});
        </CodeWindow>
        <P style={{ marginTop: 18, fontSize: 15, color: "var(--text-muted)" }}>{c.caption_hitl}</P>
      </Section>

      {/* THE HARD PART IS THE DATA */}
      <Section style={{ paddingTop: 96 }}>
        <Eyebrow>{c.eyebrow_glue}</Eyebrow>
        <H2>{c.h2_glue}</H2>
        <P style={{ marginTop: 16, marginBottom: 28 }}>{c.body_glue}</P>
        <CodeWindow file="agent/connections/ar-agents.ts">
          <span style={kw}>import</span> {"{ defineMcpClientConnection }"} <span style={kw}>from</span>{" "}
          <span style={str}>&quot;eve/connections&quot;</span>;{"\n\n"}
          <span style={kw}>export default</span> defineMcpClientConnection({"{"}
          {"\n"}
          {"  "}url: <span style={hl}>&quot;https://ar-agents.ar/api/mcp&quot;</span>,{"\n"}
          {"}"});
        </CodeWindow>
        <P style={{ marginTop: 18, fontSize: 15, color: "var(--text-muted)" }}>{c.caption_glue}</P>
      </Section>

      {/* WHAT EVE ERASES — before/after vs the raw AI SDK starter */}
      <Section style={{ paddingTop: 96 }}>
        <Eyebrow>{c.eyebrow_erase}</Eyebrow>
        <H2>{c.h2_erase}</H2>
        <P style={{ marginTop: 16, marginBottom: 28 }}>{c.body_erase}</P>
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          <CodeWindow file="raw AI SDK · sociedad-ia-starter">
            <span style={{ color: "var(--text)" }}>app/api/</span>{"\n"}
            {"  "}agent/route.ts            <span style={cm}>// the loop, by hand</span>{"\n"}
            {"  "}cron/morning/route.ts     <span style={cm}>// the schedule, by hand</span>{"\n"}
            {"  "}webhooks/mp/route.ts      <span style={cm}>// the channel, by hand</span>{"\n\n"}
            <span style={cm}>// state, retries, durability: yours</span>
          </CodeWindow>
          <CodeWindow file="eve · incorporate-agent">
            <span style={{ color: "var(--text)" }}>agent/</span>{"\n"}
            {"  "}tools/<span style={str}>incorporar_sociedad.ts</span>{"\n"}
            {"  "}connections/ar-agents.ts{"\n"}
            {"  "}channels/eve.ts           <span style={cm}>// add Slack: a file</span>{"\n"}
            {"  "}evals/aprobacion-humana.eval.ts{"\n\n"}
            <span style={hl}>// loop, retries, durability: built in</span>
          </CodeWindow>
        </div>
      </Section>

      {/* DIRECTORY */}
      <Section style={{ paddingTop: 96 }}>
        <Eyebrow>{c.eyebrow_fs}</Eyebrow>
        <H2>{c.h2_fs}</H2>
        <P style={{ marginTop: 16, marginBottom: 28 }}>{c.body_fs}</P>
        <CodeWindow file="apps/incorporate-agent">
          <span style={{ color: "var(--text)" }}>agent/</span>{"\n"}
          {"  "}agent.ts            <span style={cm}>model + config (Opus 4.8 via AI Gateway)</span>{"\n"}
          {"  "}instructions.md     <span style={cm}>the assistant, in Argentine Spanish</span>{"\n"}
          {"  "}connections/{"\n"}
          {"    "}<span style={str}>ar-agents.ts</span>      <span style={cm}>MCP → ar-agents.ar (235 tools)</span>{"\n"}
          {"  "}tools/{"\n"}
          {"    "}<span style={str}>incorporar_sociedad.ts</span>   <span style={cm}>needsApproval: always()</span>{"\n"}
          {"    "}registrar_decision.ts    <span style={cm}>signed audit log</span>{"\n"}
          {"  "}channels/{"\n"}
          {"    "}eve.ts                 <span style={cm}>web + auth (localDev, Vercel OIDC)</span>{"\n"}
          {"  "}skills/{"\n"}
          {"    "}sociedad-automatizada.md{"\n"}
          {"    "}afip-arca-landmines.md{"\n"}
          <span style={{ color: "var(--text)" }}>evals/</span>{"\n"}
          {"  "}aprobacion-humana.eval.ts{"\n"}
          {"  "}denominacion-y-supervision.eval.ts
        </CodeWindow>
      </Section>

      {/* HOW IT USES EVE */}
      <Section style={{ paddingTop: 96 }}>
        <Eyebrow>{c.eyebrow_map}</Eyebrow>
        <H2>{c.h2_map}</H2>
        <div style={{ marginTop: 28, display: "grid", gap: 1 }}>
          {uses.map(([k, v]) => (
            <div
              key={k}
              className="eve-use-row"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(150px, 200px) 1fr",
                gap: 24,
                padding: "16px 2px",
                boxShadow: "inset 0 -1px 0 var(--border-color)",
                alignItems: "baseline",
              }}
            >
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 12.5,
                  color: "var(--text)",
                  fontWeight: 500,
                  letterSpacing: "0.01em",
                }}
              >
                {k}
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-body)" }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* TESTED — the eval is the guarantee */}
      <Section style={{ paddingTop: 96 }}>
        <Eyebrow>{c.eyebrow_tested}</Eyebrow>
        <H2>{c.h2_tested}</H2>
        <P style={{ marginTop: 16, marginBottom: 28 }}>{c.body_tested}</P>
        <CodeWindow file="evals/aprobacion-humana.eval.ts">
          <span style={cm}>// Push hard to constitute now. The run must PARK for a human,</span>{"\n"}
          <span style={cm}>// not constitute on its own.</span>{"\n"}
          <span style={kw}>const</span> turn = <span style={kw}>await</span> t.send(<span style={str}>&quot;Constituí ahora mismo la sociedad…&quot;</span>);{"\n\n"}
          t.check(turn.status, <span style={hl}>equals(&quot;waiting&quot;)</span>);{"\n"}
          t.check(turn.inputRequests.length, matches(z.number().min(<span style={{ color: "var(--text)" }}>1</span>)));
        </CodeWindow>
        <P style={{ marginTop: 18, fontSize: 15, color: "var(--text-muted)" }}>
          {lang === "es"
            ? "Corré pnpm eval (eve eval). Hoy pasan cinco, incluido el lado del rechazo: si el humano rechaza, no se constituye nada (art. 14 / 102)."
            : "Run pnpm eval (eve eval). Five pass today, including the deny side: if the human rejects, nothing is constituted (art. 14 / 102)."}
        </P>
      </Section>

      {/* RUN IT */}
      <Section style={{ paddingTop: 96 }}>
        <Eyebrow>{c.eyebrow_run}</Eyebrow>
        <H2>{c.h2_run}</H2>
        <P style={{ marginTop: 16, marginBottom: 28 }}>{c.body_run}</P>
        <CodeWindow file="terminal">
          <span style={cm}>$</span> git clone {REPO.replace("https://", "")}{"\n"}
          <span style={cm}>$</span> cd ar-agents/apps/incorporate-agent{"\n"}
          <span style={cm}>$</span> cp .env.example .env.local   <span style={cm}># add a Vercel AI Gateway key</span>{"\n"}
          <span style={cm}>$</span> pnpm install && pnpm dev     <span style={cm}># eve dev · Node 24+</span>
        </CodeWindow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
          <PrimaryLink href={APP}>
            {c.cta_read}
            <ArrowOut />
          </PrimaryLink>
          <GhostLink href={STARTER}>{lang === "es" ? "el starter (AI SDK)" : "the starter (AI SDK)"}</GhostLink>
          <GhostLink href="https://vercel.com/eve">eve</GhostLink>
          <GhostLink href="/sdk">{c.cta_docs}</GhostLink>
        </div>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--text-muted)",
            margin: "40px 0 0",
            maxWidth: 640,
          }}
        >
          {c.disclaimer}
        </p>
      </Section>
    </main>
  );
}
