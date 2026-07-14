import type { Metadata } from "next";
import { DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { CiteClient } from "./cite-client";

/**
 * /cite, citation generator. The adversarial regulator review flagged
 * that "cite-by-reference" to /rfcs/{n} is legally inviable because URLs
 * are mutable. This page fixes that: pick an RFC, supply a commit hash
 * (we auto-fill with the latest known one), and get an immutable BibTeX
 * / APA / Chicago citation that locks the document state.
 *
 * The output is also accessible via GET /api/cite for programmatic
 * tooling (legislative drafters, scholars).
 */

const KNOWN_RFCS = [
  {
    id: "001",
    title: "Identidad y firma de agentes en Argentina",
    titleEn: "Identity and signature for AI agents in Argentina",
    date: "2026-05-08",
    doi: "10.5281/zenodo.20159396",
  },
  {
    id: "002",
    title: "Descubrimiento de agentes por defecto",
    titleEn: "Agent-Discovery-By-Default",
    date: "2026-05-09",
    doi: "10.5281/zenodo.20159407",
  },
  {
    id: "003",
    title: "Envelope de reciprocidad cross-jurisdiccional",
    titleEn: "Cross-jurisdictional reciprocity envelope",
    date: "2026-05-09",
    doi: "10.5281/zenodo.20159411",
  },
  {
    id: "004",
    title: "Especificación normativa del log operativo",
    titleEn: "Operational-log specification",
    date: "2026-05-10",
    doi: "10.5281/zenodo.20159417",
  },
  {
    id: "005",
    title: "Migración asimétrica del log (Ed25519)",
    titleEn: "Asymmetric upgrade for the operational log",
    date: "2026-05-11",
    doi: "10.5281/zenodo.20159424",
  },
  // RFC-006 is intentionally omitted here: its Zenodo DOI is still pending
  // (see /refs, which cites it by canonical URL). Add it once the DOI is minted
  // so the generator never emits a fabricated identifier.
];

export const metadata: Metadata = {
  title: "Generador de citas inmutables · ar-agents",
  description:
    "Citaciones BibTeX / APA / Chicago para los RFCs ar-agents, ancladas a un commit hash inmutable de GitHub. Para legisladores, asesores y académicos que necesitan citar la spec con la versión exacta del momento de la cita.",
  alternates: { canonical: "https://ar-agents.ar/cite" },
  openGraph: {
    type: "article",
    title:
      "Generador de citas inmutables, ar-agents RFCs",
    description:
      "BibTeX / APA / Chicago para cualquier RFC, ancladas a commit hash. Para legisladores, asesores, académicos.",
    url: "https://ar-agents.ar/cite",
  },
};

export default function CitePage() {
  return (
    <DocShell
      eyebrow="cite · generador de citas inmutables"
      title="Citá un RFC con commit hash inmutable."
      subtitle="Las URLs canónicas /rfcs/{n} pueden mutar; el contenido de un commit no. Esta página genera la cita en BibTeX, APA y Chicago para cualquier RFC ar-agents, anclada al commit que vos elijas. Para legisladores que necesitan que la cita sobreviva a un changelog."
    >
      <DocP>
        El{" "}
        <a
          href="/legislacion"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          texto sugerido en /legislación
        </a>{" "}
        propone que la ley argentina cite RFC-001..006 por referencia. El
        problema obvio: la URL <DocCode>/rfcs/004</DocCode> puede
        cambiar, yo puedo editarla, Vercel puede caerse, GitHub puede
        mover el repo. Una ley no puede depender de eso. La fix es estándar
        académica: <strong>citar el commit hash</strong>, no la URL
        canónica.
      </DocP>
      <DocP>
        Esta página automatiza la generación de esa cita. Elegí el RFC,
        verificá el commit hash que querés anclar (el default es el HEAD
        actual de <DocCode>main</DocCode>), y obtené las tres
        formalizaciones académicas estándar.
      </DocP>

      <CiteClient knownRfcs={KNOWN_RFCS} />

      <DocH2>Por qué tres formatos</DocH2>
      <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
        <li style={{ marginBottom: 8 }}>
          <strong>BibTeX</strong>, el formato que los académicos copian
          en sus papers. Útil si un investigador en derecho corporativo
          cita el RFC en un journal.
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>APA 7th edition</strong>, el formato que el campo de
          ciencias sociales y políticas usa. Útil para periodistas
          técnicos, asesores legislativos, think tanks (CARI, Fundación
          Pensar, CIPPEC).
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Chicago Manual of Style</strong>, el formato que usa
          el campo legal en EE.UU. + parte de la academia argentina (UBA
          Derecho, UTDT Derecho). Útil para citaciones en proyectos de
          ley o documentos del Ministerio de Justicia.
        </li>
      </ul>

      <DocH2>API programática</DocH2>
      <DocP>
        El mismo generador está disponible via{" "}
        <DocCode>GET /api/cite</DocCode>:
      </DocP>
      <pre
        style={{
          background: "var(--code-bg)",
          color: "var(--code-text)",
          padding: 14,
          borderRadius: 8,
          fontSize: 12.5,
          lineHeight: 1.55,
          overflow: "auto",
          margin: "8px 0 16px",
        }}
      >
        {`GET /api/cite?rfc=004&commit=9e55f82
Accept: application/json

{
  "rfc": "004",
  "commit": "9e55f82f12e5b3017f165c7b4f9f144b68868512",
  "title": "Especificación normativa del log operativo",
  "author": "Nazareno Clemente",
  "date": "2026-05-10",
  "doi": "10.5281/zenodo.20159417",
  "url": "https://github.com/ar-agents/ar-agents/blob/9e55f82.../apps/landing/src/app/rfcs/004/page.tsx",
  "bibtex": "@misc{ar-agents-rfc-004-9e55f82, ... }",
  "apa": "Clemente, N. (2026). Especificación normativa del log operativo (Version 9e55f82). ar-agents. https://doi.org/10.5281/zenodo.20159417",
  "chicago": "Clemente, Nazareno. ..."
}`}
      </pre>

      <DocH2>Limitaciones honestas</DocH2>
      <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
        <li style={{ marginBottom: 8 }}>
          <strong>Los RFCs aún están en estado draft.</strong> Citarlos
          en un proyecto de ley antes de que pasen a estado stable
          (próximo paso: revisión por co-firmantes externos) es{" "}
          <strong>citar trabajo en progreso</strong>. Recomendado solo
          para discusión legislativa preparatoria, no para articulado
          final.
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Inmutabilidad real está cubierta por DOI Zenodo.</strong>{" "}
          Cada RFC tiene un DOI propio en Zenodo (CERN), arriba en el
          generador de citas. El DOI sobrevive si{" "}
          <DocCode>github.com/ar-agents/ar-agents</DocCode> desaparece o
          el autor migra el repo. Para citas legislativas formales, usá
          el DOI como anchor primario; el commit hash como redundancia.
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>El autor no es jurista matriculado.</strong>{" "}
          La autoría de estos RFCs es <em>técnica</em>, no jurídica.
          Cualquier adopción legislativa requiere co-firma o revisión
          por especialistas (abogado corporativo, escribano, especialista
          AAIP).
        </li>
      </ul>

      <DocH2>Cómo ayuda</DocH2>
      <DocP>
        Si sos asesor de un legislador o asesor del Ministerio: pegá la
        cita Chicago en tu memo, y la ley referencia un estado
        congelado del documento. Si más adelante el RFC evoluciona a
        v2, la ley sigue citando v1; el operador opta por v2 cuando lo
        decida la propia ley o el reglamento.
      </DocP>
    </DocShell>
  );
}
