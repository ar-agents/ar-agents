import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { JsonLd } from "../json-ld";

export const metadata: Metadata = {
  title: "/comparison · AR sociedad-IA vs Wyoming, MIDAO, Estonia",
  description:
    "How Argentina's proposed sociedad-IA compares to Wyoming DAO LLC (2021), Marshall Islands MIDAO (2022), Delaware Series LLC, and Estonia e-Residency. The first regime that lets the entity itself be 100% AI.",
  alternates: { canonical: "https://ar-agents.vercel.app/comparison" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type Cell =
  | { value: string; tone?: "yes" | "no" | "partial" | "neutral"; note?: string }
  | { multiline: string[]; tone?: "yes" | "no" | "partial" | "neutral" };

interface Row {
  dimension: string;
  ar: Cell;
  wyoming: Cell;
  midao: Cell;
  estonia: Cell;
  delaware: Cell;
}

const ROWS: Row[] = [
  {
    dimension: "Year regime introduced",
    ar: { value: "Anuncio 2026 · ley estimada H1 2027", tone: "neutral" },
    wyoming: { value: "2021 (DAO LLC Act)", tone: "neutral" },
    midao: { value: "2022 (DAO Foundation)", tone: "neutral" },
    estonia: { value: "2014 (e-Residency)", tone: "neutral" },
    delaware: { value: "1996 (Series LLC)", tone: "neutral" },
  },
  {
    dimension: "Entity can be 100% AI (no human owner / member)",
    ar: { value: "Yes — first regime", tone: "yes", note: "the headline" },
    wyoming: {
      value: "No",
      tone: "no",
      note: "members can be smart contracts, but at least one human signer required",
    },
    midao: {
      value: "Partial",
      tone: "partial",
      note: "Foundation requires founders + council; can be DAO-controlled",
    },
    estonia: {
      value: "No",
      tone: "no",
      note: "e-Resident is a natural person; OÜ requires human board",
    },
    delaware: {
      value: "No",
      tone: "no",
      note: "manager-managed LLCs still need a manager-of-record human",
    },
  },
  {
    dimension: "Native digital identity for the entity",
    ar: {
      value: "CUIT + DEC + cert ARCA",
      tone: "yes",
      note: "GDE/TAD inbox for state notifications",
    },
    wyoming: { value: "EIN only", tone: "partial" },
    midao: { value: "Foundation registry", tone: "partial" },
    estonia: { value: "X-Road + e-Identity", tone: "yes" },
    delaware: { value: "EIN only", tone: "partial" },
  },
  {
    dimension: "Tax compliance fully digital",
    ar: {
      value: "Yes",
      tone: "yes",
      note: "AFIP/ARCA WSFE + ws_sr_constancia",
    },
    wyoming: { value: "Federal IRS", tone: "partial" },
    midao: { value: "0% tax (offshore)", tone: "yes" },
    estonia: { value: "Yes (e-Tax)", tone: "yes" },
    delaware: { value: "Federal IRS", tone: "partial" },
  },
  {
    dimension: "Banking native to jurisdiction",
    ar: {
      value: "Yes",
      tone: "yes",
      note: "BCRA + CBU + Mercado Pago",
    },
    wyoming: { value: "US banking", tone: "yes" },
    midao: { value: "Crypto-native + USD via offshore", tone: "partial" },
    estonia: {
      value: "Limited",
      tone: "partial",
      note: "fintech (Wise, Holvi) — no traditional EE bank for non-residents",
    },
    delaware: { value: "US banking", tone: "yes" },
  },
  {
    dimension: "Operate without local presence",
    ar: {
      value: "Partial",
      tone: "partial",
      note: "human representante required by RFC-001 § 3.1; could be platform partner",
    },
    wyoming: { value: "Yes", tone: "yes" },
    midao: { value: "Yes (offshore)", tone: "yes" },
    estonia: { value: "Yes (designed for it)", tone: "yes" },
    delaware: { value: "Yes (with registered agent)", tone: "yes" },
  },
  {
    dimension: "Regulatory clarity for AI agents acting as the entity",
    ar: {
      value: "First-class (proposed)",
      tone: "yes",
      note: "regime is built around this exact case",
    },
    wyoming: {
      value: "Implicit",
      tone: "partial",
      note: "DAO LLC contemplates code-controlled but doesn't deeply spec liability",
    },
    midao: {
      value: "Implicit",
      tone: "partial",
    },
    estonia: { value: "No", tone: "no", note: "human-only by spec" },
    delaware: { value: "No", tone: "no", note: "no AI-specific clauses" },
  },
  {
    dimension: "Liability framework spelled out",
    ar: {
      value: "RFC-001 § 9 (3-layer)",
      tone: "yes",
      note: "operator / model provider / library author",
    },
    wyoming: { value: "Implicit (LLC)", tone: "partial" },
    midao: { value: "Foundation-level limited liability", tone: "partial" },
    estonia: {
      value: "Standard EU corporate",
      tone: "partial",
    },
    delaware: { value: "Implicit (LLC)", tone: "partial" },
  },
  {
    dimension: "Forensic audit log spec'd as legal requirement",
    ar: {
      value: "RFC-001 § 9.2",
      tone: "yes",
      note: "HMAC-SHA256, append-only, legally probative",
    },
    wyoming: { value: "No", tone: "no" },
    midao: { value: "No (on-chain implicit)", tone: "partial" },
    estonia: { value: "No", tone: "no" },
    delaware: { value: "No", tone: "no" },
  },
  {
    dimension: "Open-source reference implementation",
    ar: {
      value: "@ar-agents/* · 17 npm packages MIT",
      tone: "yes",
      note: "this site",
    },
    wyoming: { value: "Community-built", tone: "partial" },
    midao: { value: "Community-built", tone: "partial" },
    estonia: { value: "Government-provided + community", tone: "yes" },
    delaware: { value: "None official", tone: "no" },
  },
  {
    dimension: "Time to incorporate",
    ar: {
      value: "5-10 días (current SAS)",
      tone: "partial",
      note: "post-launch: target 1 día",
    },
    wyoming: { value: "Same day", tone: "yes" },
    midao: { value: "1-3 días", tone: "yes" },
    estonia: { value: "Days post-card", tone: "partial" },
    delaware: { value: "Same day", tone: "yes" },
  },
  {
    dimension: "Estimated cost (USD, first year)",
    ar: { value: "$0-$200 (SAS)", tone: "yes" },
    wyoming: { value: "$50-$300", tone: "yes" },
    midao: { value: "$3,000+", tone: "no" },
    estonia: { value: "€100-€300", tone: "yes" },
    delaware: { value: "$200-$400", tone: "yes" },
  },
];

const TONE_COLOR: Record<NonNullable<Cell["tone"]>, string> = {
  yes: "#22c55e",
  no: "#ff5b4f",
  partial: "#eab308",
  neutral: "#666666",
};

function getValue(cell: Cell): string {
  if ("value" in cell) return cell.value;
  return cell.multiline.join("\n");
}

function CellRender({ cell }: { cell: Cell }) {
  const tone = cell.tone ?? "neutral";
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontFamily: FONT_MONO,
          color: TONE_COLOR[tone],
          fontWeight: 600,
          lineHeight: 1.4,
        }}
      >
        {getValue(cell)}
      </div>
      {"note" in cell && cell.note && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 2,
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          {cell.note}
        </div>
      )}
    </div>
  );
}

export default function ComparisonPage() {
  const tableSchema = {
    "@context": "https://schema.org",
    "@type": "Table",
    name: "AR sociedad-IA vs Wyoming, MIDAO, Estonia, Delaware",
    description:
      "12-dimension comparison of jurisdictional regimes for AI-only or remote-first entities.",
    url: "https://ar-agents.vercel.app/comparison",
  };

  return (
    <DocShell
      eyebrow="/arg · comparison · 2026-05"
      title="vs Wyoming, MIDAO, Estonia, Delaware."
      subtitle="12 dimensions × 5 jurisdictions. Argentina's proposed sociedad-IA is the first regime where the entity itself can be 100% AI — not just AI-controlled, AI-owned. The other four leading regimes still require a human signer at some layer."
    >
      <DocBlock>
        <DocP>
          The most-cited prior art for AI-friendly entity regimes is{" "}
          <strong>Wyoming DAO LLC (2021)</strong>,{" "}
          <strong>Marshall Islands MIDAO (2022)</strong>,{" "}
          <strong>Estonia e-Residency (2014)</strong>, and{" "}
          <strong>Delaware Series LLC (1996)</strong>. Each is genuinely
          useful, each gets close to "an AI can be the entity", none
          actually crosses that line because all four require a human
          signer somewhere — a member, a foundation council, an
          e-Resident, a registered agent.
        </DocP>
        <DocP>
          Argentina&apos;s proposed sociedad-IA (anuncio Sturzenegger
          28-abr-2026) is the first regime to {" "}
          <em>not require</em> a human in any role. The human
          representante in <a href="/rfcs/001" style={{ color: "var(--accent)" }}>RFC-001 § 3.1</a>{" "}
          is the operator&apos;s contractual choice, not a regime
          requirement. That is the structural difference this table
          shows.
        </DocP>
      </DocBlock>

      <DocH2>The table</DocH2>
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
            minWidth: 920,
          }}
          aria-label="Comparison of AR sociedad-IA vs other jurisdictions"
        >
          <thead>
            <tr>
              <Th>Dimensión</Th>
              <Th tone="primary">AR · sociedad-IA</Th>
              <Th>Wyoming DAO LLC</Th>
              <Th>Marshall Islands MIDAO</Th>
              <Th>Estonia e-Residency</Th>
              <Th>Delaware Series LLC</Th>
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
                  <CellRender cell={row.ar} />
                </td>
                <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                  <CellRender cell={row.wyoming} />
                </td>
                <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                  <CellRender cell={row.midao} />
                </td>
                <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                  <CellRender cell={row.estonia} />
                </td>
                <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                  <CellRender cell={row.delaware} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocH2>Why this matters geopolitically</DocH2>
      <DocP>
        Wyoming and Delaware together host ~40% of US LLCs. Estonia ran
        e-Residency for over a decade and crossed 100,000 entities. MIDAO
        is the offshore alternative for crypto-native operations. None of
        these stops being useful — but if Argentina ships the regime,
        every AI-only entity globally has a {" "}
        <em>jurisdictional choice</em> they don&apos;t have today.
      </DocP>
      <DocP>
        The implementation matters as much as the regime. A jurisdiction
        without an open-source reference toolkit is paper-only. Estonia
        succeeded because the X-Road digital infrastructure shipped
        before the e-Residency program scaled. Argentina is in the same
        spot today: the regime is announced, the technical
        infrastructure has to match for the day-1 wave to use it.
        That&apos;s exactly what this codebase is for.
      </DocP>

      <DocH2>What's different about ar-agents</DocH2>
      <DocP>
        Five things, in order:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Public reference implementation</strong> — every
          operating piece is npm-installable today. Wyoming has no
          equivalent.{" "}
          <code style={inline}>pnpm add @ar-agents/identity</code> right now.
        </Li>
        <Li>
          <strong>Liability framework specified</strong> — RFC-001 § 9
          proposes a contractually-clear three-layer model. Wyoming&apos;s
          DAO LLC Act left this implicit, which is partly why DAO LLC
          adoption stalled (lawyers couldn&apos;t advise around the
          ambiguity).
        </Li>
        <Li>
          <strong>Forensic audit log primitives</strong> — HMAC-signed,
          KV-persisted, publicly verifiable at{" "}
          <a href="/verify" style={{ color: "var(--accent)" }}>/verify</a>.
          MIDAO leans on on-chain logs but has no probative framework around them.
        </Li>
        <Li>
          <strong>Native fiscal integration</strong> — AFIP/ARCA factura,
          BCRA banking, Mercado Pago. Estonia&apos;s e-Residency plus EU VAT
          is comparably integrated; Wyoming and Delaware leave each operator
          to figure out federal/state filings.
        </Li>
        <Li>
          <strong>Cross-jurisdictional bridge</strong> — RFC-001 § 7
          sketches how an existing Wyoming/MIDAO/Estonia entity composes
          with an AR sociedad-IA via a thin facade.{" "}
          <a href="/examples#18" style={{ color: "var(--accent)" }}>
            Cookbook recipe 18
          </a>{" "}
          ships the code.
        </Li>
      </ul>

      <DocH2>What Argentina has to actually do</DocH2>
      <DocP>
        Three milestones, in order:
      </DocP>
      <ol style={listStyle}>
        <Li>
          <strong>Sancionar la ley</strong>. Estimated H1 2027 per the SAS
          precedent (12 months anuncio→sanción). Risk: octubre 2026
          legislativas.
        </Li>
        <Li>
          <strong>ARCA + IGJ digital pipelines</strong>. Today&apos;s
          AFIP cert flow takes 5-10 días. Post-launch target: 1 día.
          Pieza 17 (TAD escritura programática) needs an API the State
          documents publicly.
        </Li>
        <Li>
          <strong>Acuerdos cross-jurisdictional</strong>. Treaties or MOUs
          with Wyoming / MI / Estonia for entity recognition. Without
          those, an AR sociedad-IA can operate in AR but is treated as a
          generic foreign entity abroad.
        </Li>
      </ol>

      <DocH2>For asesores escribiendo un memo</DocH2>
      <DocP>
        Una línea citable:{" "}
        <em>
          La sociedad-IA argentina sería la primera figura jurídica donde la
          entidad misma puede ser 100% IA, sin requerimiento estructural de
          firmante humano. Las cuatro figuras prior-art comparables (Wyoming
          DAO LLC, MIDAO, Estonia e-Residency, Delaware Series LLC) requieren
          un humano en al menos una capa.
        </em>
      </DocP>

      <JsonLd data={tableSchema} />
    </DocShell>
  );
}

function Th({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "primary";
}) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "12px 14px",
        fontFamily: FONT_MONO,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: tone === "primary" ? "var(--accent)" : "var(--text-muted)",
        fontWeight: 600,
        borderBottom: "1px solid var(--text-muted)",
        verticalAlign: "bottom",
      }}
    >
      {children}
    </th>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ marginBottom: 8, lineHeight: 1.55, color: "var(--text-body)" }}>
      {children}
    </li>
  );
}

const listStyle: React.CSSProperties = {
  paddingLeft: 24,
  fontSize: 14,
  marginBottom: 24,
};

const inline: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 13,
  background: "var(--bg-tint)",
  padding: "1px 6px",
  borderRadius: 4,
};
