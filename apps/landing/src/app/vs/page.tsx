import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "vs · cómo se compara con las alternativas",
  description:
    "Cómo se compara @ar-agents/* con las alternativas: AfipSDK, integración handrolled, consultoría Globant, MercadoPago SDK oficial, Mi Argentina sin librería, soluciones cerradas. Tabla honesta — qué cubre cada uno y qué no.",
  alternates: { canonical: "https://ar-agents.vercel.app/vs" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type Cell = { value: string; tone?: "pos" | "neg" | "neu"; note?: string };
type Row = { dimension: string; ours: Cell; afipsdk: Cell; handrolled: Cell; consultoria: Cell };

const ROWS: Row[] = [
  {
    dimension: "Surface AR cubierto (de las 17 piezas)",
    ours: { value: "16/17", tone: "pos", note: "TAD escritura pendiente" },
    afipsdk: { value: "1-2", tone: "neg", note: "AFIP/ARCA only" },
    handrolled: { value: "depende", tone: "neu", note: "lo que hagas" },
    consultoria: { value: "depende", tone: "neu", note: "lo que pagues" },
  },
  {
    dimension: "Open source (auditable)",
    ours: { value: "MIT", tone: "pos" },
    afipsdk: { value: "Cerrado", tone: "neg" },
    handrolled: { value: "Tu code", tone: "pos" },
    consultoria: { value: "Cerrado", tone: "neg" },
  },
  {
    dimension: "Provenance (SLSA v1)",
    ours: { value: "Sí", tone: "pos" },
    afipsdk: { value: "No", tone: "neg" },
    handrolled: { value: "—", tone: "neu" },
    consultoria: { value: "No", tone: "neg" },
  },
  {
    dimension: "Vercel AI SDK 6 native (Experimental_Agent)",
    ours: { value: "Sí", tone: "pos" },
    afipsdk: { value: "No", tone: "neg" },
    handrolled: { value: "Tu code", tone: "neu" },
    consultoria: { value: "Custom", tone: "neg" },
  },
  {
    dimension: "Edge Runtime (Vercel Edge / CF Workers / Deno)",
    ours: { value: "Sí, todo", tone: "pos" },
    afipsdk: { value: "Node only", tone: "neg" },
    handrolled: { value: "Depende", tone: "neu" },
    consultoria: { value: "Depende", tone: "neu" },
  },
  {
    dimension: "MCP host (Claude Desktop / Cursor / Continue)",
    ours: { value: "Sí (@ar-agents/mcp)", tone: "pos" },
    afipsdk: { value: "No", tone: "neg" },
    handrolled: { value: "—", tone: "neu" },
    consultoria: { value: "No", tone: "neg" },
  },
  {
    dimension: "ACP (LLM-buyer checkout)",
    ours: { value: "Sí (bridge)", tone: "pos" },
    afipsdk: { value: "No", tone: "neg" },
    handrolled: { value: "—", tone: "neu" },
    consultoria: { value: "No", tone: "neg" },
  },
  {
    dimension: "AP2 mandate verification",
    ours: { value: "Sí (@ar-agents/ap2)", tone: "pos" },
    afipsdk: { value: "No", tone: "neg" },
    handrolled: { value: "—", tone: "neu" },
    consultoria: { value: "No", tone: "neg" },
  },
  {
    dimension: "HITL programático en ops irreversibles",
    ours: { value: "8 tools", tone: "pos" },
    afipsdk: { value: "Manual", tone: "neg" },
    handrolled: { value: "Lo armás", tone: "neu" },
    consultoria: { value: "Caso a caso", tone: "neu" },
  },
  {
    dimension: "Audit log con HMAC timestamps",
    ours: { value: "Sí, default-on", tone: "pos" },
    afipsdk: { value: "No", tone: "neg" },
    handrolled: { value: "Tu code", tone: "neu" },
    consultoria: { value: "Caso a caso", tone: "neu" },
  },
  {
    dimension: "Marco de responsabilidad (3 capas)",
    ours: { value: "RFC-001", tone: "pos" },
    afipsdk: { value: "Implícito", tone: "neg" },
    handrolled: { value: "—", tone: "neu" },
    consultoria: { value: "Contractual", tone: "neu" },
  },
  {
    dimension: "Threat model público",
    ours: { value: "14 amenazas", tone: "pos" },
    afipsdk: { value: "No", tone: "neg" },
    handrolled: { value: "—", tone: "neu" },
    consultoria: { value: "Cerrado", tone: "neg" },
  },
  {
    dimension: "Cookbook de patrones de producción",
    ours: { value: "17 recetas", tone: "pos" },
    afipsdk: { value: "Docs API", tone: "neu" },
    handrolled: { value: "—", tone: "neu" },
    consultoria: { value: "Cerrado", tone: "neg" },
  },
  {
    dimension: "Costo upfront",
    ours: { value: "$0", tone: "pos" },
    afipsdk: { value: "Suscripción", tone: "neu" },
    handrolled: { value: "Tu tiempo", tone: "neu" },
    consultoria: { value: "USD 30k+", tone: "neg" },
  },
  {
    dimension: "Costo ongoing",
    ours: { value: "Hosting solo", tone: "pos" },
    afipsdk: { value: "USD 50-200/mo", tone: "neu" },
    handrolled: { value: "Mantenimiento", tone: "neu" },
    consultoria: { value: "USD 5k+/mo", tone: "neg" },
  },
  {
    dimension: "Time-to-first-tool-call",
    ours: { value: "10 min", tone: "pos", note: "vía /incorporar" },
    afipsdk: { value: "horas", tone: "neu" },
    handrolled: { value: "días", tone: "neg" },
    consultoria: { value: "semanas", tone: "neg" },
  },
];

const TONE_COLOR = { pos: "#22c55e", neg: "#ef4444", neu: "var(--text-muted)" };

function CellRender({ cell }: { cell: Cell }) {
  const tone = cell.tone ?? "neu";
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          fontFamily: FONT_MONO,
          color: TONE_COLOR[tone],
          fontWeight: 600,
        }}
      >
        {cell.value}
      </div>
      {cell.note && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 2,
            fontStyle: "italic",
          }}
        >
          {cell.note}
        </div>
      )}
    </div>
  );
}

export default function VsPage() {
  return (
    <DocShell
      eyebrow="/arg · vs · 2026-05"
      title="Cómo se compara."
      subtitle="Tabla honesta vs las 4 alternativas reales para operar como sociedad-IA argentina hoy. Ningún competidor te cubre las 17 piezas; este es el único que cubre 16."
    >
      <DocBlock>
        <DocP>
          La pregunta en cada review (técnico o regulatorio) es la misma:{" "}
          <em>¿qué cubre esto que no cubre lo que ya existe?</em> Esta
          página la responde con una tabla. Si la respuesta no es buena,
          la tabla muestra el gap honesto y volvemos al draft.
        </DocP>
        <DocP>
          <strong>Las alternativas comparadas:</strong>{" "}
          <DocCode>AfipSDK</DocCode> (la opción closed-source más conocida
          para AFIP/ARCA),{" "}
          <DocCode>handrolled</DocCode> (escribir todo desde cero,
          potencialmente con SDKs oficiales aislados), y{" "}
          <DocCode>consultoría</DocCode> (Globant / Despegar consulting /
          house de software local resolviéndolo a 5-figuras-USD).
        </DocP>
      </DocBlock>

      <DocH2>La tabla</DocH2>

      <div
        style={{
          overflowX: "auto",
          background: "var(--bg)",
          borderRadius: 8,
          padding: 4,
          boxShadow: "var(--card-shadow)",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  borderBottom: "1px solid var(--text-muted)",
                }}
              >
                Dimensión
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--accent)",
                  fontWeight: 600,
                  borderBottom: "1px solid var(--text-muted)",
                }}
              >
                @ar-agents/*
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  borderBottom: "1px solid var(--text-muted)",
                }}
              >
                AfipSDK
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  borderBottom: "1px solid var(--text-muted)",
                }}
              >
                Handrolled
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  borderBottom: "1px solid var(--text-muted)",
                }}
              >
                Consultoría
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr
                key={row.dimension}
                style={{
                  background: i % 2 === 0 ? "var(--bg)" : "var(--bg-tint)",
                }}
              >
                <td
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    color: "var(--text)",
                    fontWeight: 500,
                    verticalAlign: "top",
                  }}
                >
                  {row.dimension}
                </td>
                <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                  <CellRender cell={row.ours} />
                </td>
                <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                  <CellRender cell={row.afipsdk} />
                </td>
                <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                  <CellRender cell={row.handrolled} />
                </td>
                <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                  <CellRender cell={row.consultoria} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocH2>Cuándo elegir cada uno</DocH2>
      <DocP>
        <strong>@ar-agents/*</strong> — cuando estás construyendo un agente
        que opera la totalidad de un negocio AR (factura + cobro + identidad
        + comms + logística + macro + Boletín Oficial + IGJ). El surface es
        coherente, audita-friendly, y compone con la stack Vercel/AI-SDK.
      </DocP>
      <DocP>
        <strong>AfipSDK</strong> — si solo te importa AFIP/ARCA y no estás
        operando como agente. Closed source pero suficientemente probado;
        ahorra tiempo si el alcance está acotado a factura electrónica.
      </DocP>
      <DocP>
        <strong>Handrolled</strong> — si tenés un equipo de 3+ devs senior
        con bandwidth para entender SOAP+WSDL+WSAA, mantener cert renewals,
        debuggear A13 vs A5 vs constancia_inscripcion, manejar las 11
        gotchas que documentamos en{" "}
        <a href="/case-studies/astro" style={{ color: "var(--accent)" }}>
          /case-studies/astro
        </a>
        . Y todo eso para los próximos 5 años.
      </DocP>
      <DocP>
        <strong>Consultoría</strong> — si tenés presupuesto USD 30k+ inicial
        + USD 5k+/mo y querés delegar el problema a una casa de software
        tradicional. Te resuelven, pero el resultado es cerrado y vendor-locked.
      </DocP>

      <DocH2>El argumento de fondo</DocH2>
      <DocP>
        Una sociedad-IA exige una capa de software que sea (1) auditable
        end-to-end, (2) cubra las 16 piezas operativas con coherencia
        interna, (3) compense el liability surface con HITL + audit log
        formales. Las opciones cerradas nunca van a satisfacer (1). La
        consultoría tradicional cubre (2) y (3) pero a 5 figuras al mes.
        Handrolled requiere capacidad técnica que no escala más allá de
        los pioneros.
      </DocP>
      <DocP>
        El espacio queda para una librería open-source diseñada para esto
        específicamente. Eso es lo que la tabla refleja.
      </DocP>
    </DocShell>
  );
}
