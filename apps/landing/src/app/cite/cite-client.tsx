"use client";

import { useMemo, useState } from "react";

interface RfcMeta {
  id: string;
  title: string;
  titleEn: string;
  date: string;
  doi?: string;
}

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const DEFAULT_COMMIT = "9e55f82f12e5b3017f165c7b4f9f144b68868512";

function buildCitations(rfc: RfcMeta, commit: string) {
  const short = commit.slice(0, 7);
  const year = rfc.date.slice(0, 4);
  const url = `https://github.com/ar-agents/ar-agents/blob/${commit}/apps/landing/src/app/rfcs/${rfc.id}/page.tsx`;
  const canonical = `https://ar-agents.ar/rfcs/${rfc.id}`;
  const doi = rfc.doi;
  const doiUrl = doi ? `https://doi.org/${doi}` : null;

  const bibtex = `@misc{ar-agents-rfc-${rfc.id}-${short},
  title  = {{RFC-${rfc.id}: ${rfc.title}}},
  author = {{Naza}},
  year   = {${year}},
  month  = {${rfc.date.slice(5, 7)}},${doi ? `\n  doi    = {${doi}},` : ""}
  url    = {${doiUrl ?? url}},
  note   = {ar-agents Open Infrastructure for Argentine sociedades-IA. Commit ${short}. Canonical: ${canonical}. License: CC-BY-4.0.}
}`;

  const apa = `Naza (${year}). RFC-${rfc.id}: ${rfc.title} (Version ${short}) [Technical specification]. ar-agents.${doi ? ` https://doi.org/${doi}` : ` ${url}`}`;

  const chicago = `Naza. "RFC-${rfc.id}: ${rfc.title}." ar-agents Open Infrastructure for Argentine sociedades-IA. Version ${short} (${rfc.date}).${doi ? ` https://doi.org/${doi}.` : ` ${url}.`}`;

  return { url, canonical, doi, doiUrl, bibtex, apa, chicago };
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable; user can select manually */
        }
      }}
      style={{
        padding: "4px 10px",
        fontSize: 11,
        fontFamily: FONT_MONO,
        background: copied ? "var(--success-bg)" : "var(--bg)",
        color: copied ? "var(--success)" : "var(--text-body)",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        boxShadow: "var(--shadow-ring-light)",
        transition: "background 120ms ease-out, color 120ms ease-out",
      }}
      aria-label={`Copiar ${label}`}
    >
      {copied ? "copiado ✓" : "copiar"}
    </button>
  );
}

export function CiteClient({ knownRfcs }: { knownRfcs: ReadonlyArray<RfcMeta> }) {
  const [rfcId, setRfcId] = useState<string>(knownRfcs[3]?.id ?? "001");
  const [commit, setCommit] = useState<string>(DEFAULT_COMMIT);

  const rfc = useMemo(
    () => knownRfcs.find((r) => r.id === rfcId) ?? knownRfcs[0],
    [knownRfcs, rfcId],
  );

  const trimmedCommit = commit.trim();
  const validCommit = /^[0-9a-f]{7,40}$/i.test(trimmedCommit);
  const cites = useMemo(
    () => (validCommit ? buildCitations(rfc, trimmedCommit) : null),
    [rfc, trimmedCommit, validCommit],
  );

  return (
    <div
      style={{
        margin: "24px 0 32px",
        padding: 20,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--shadow-ring-light)",
      }}
    >
      <div style={{ display: "grid", gap: 14, marginBottom: 18 }}>
        <label style={fieldLabelSty}>
          <span style={fieldLabelTextSty}>RFC</span>
          <select
            value={rfcId}
            onChange={(e) => setRfcId(e.target.value)}
            style={inputSty}
          >
            {knownRfcs.map((r) => (
              <option key={r.id} value={r.id}>
                RFC-{r.id} · {r.title}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldLabelSty}>
          <span style={fieldLabelTextSty}>Commit hash</span>
          <input
            type="text"
            value={commit}
            onChange={(e) => setCommit(e.target.value)}
            placeholder="9e55f82f12e5b3017f165c7b4f9f144b68868512"
            spellCheck={false}
            style={{
              ...inputSty,
              fontFamily: FONT_MONO,
              fontSize: 13,
            }}
            aria-invalid={!validCommit}
          />
          <span
            style={{
              fontSize: 11,
              color: validCommit ? "var(--text-muted)" : "var(--danger)",
              marginTop: 4,
            }}
          >
            {validCommit
              ? "7-40 caracteres hex. Default = HEAD de main al deploy actual."
              : "Hash inválido, pegá un commit hash de GitHub (7-40 chars hex)."}
          </span>
        </label>
      </div>

      {cites && (
        <div style={{ display: "grid", gap: 16 }}>
          <ResultBlock
            label="BibTeX"
            value={cites.bibtex}
          />
          <ResultBlock label="APA 7th edition" value={cites.apa} />
          <ResultBlock label="Chicago Manual of Style" value={cites.chicago} />
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              paddingTop: 8,
              borderTop: "1px solid var(--border-color)",
            }}
          >
            URL canónica (mutable):{" "}
            <a
              href={cites.canonical}
              style={{ color: "var(--accent)", textDecoration: "underline" }}
            >
              {cites.canonical}
            </a>
            {" · "}
            URL inmutable (este commit):{" "}
            <a
              href={cites.url}
              style={{ color: "var(--accent)", textDecoration: "underline" }}
            >
              {cites.url.slice(0, 70)}…
            </a>
            {cites.doi && (
              <>
                {" · "}
                DOI (Zenodo, inmutable):{" "}
                <a
                  href={cites.doiUrl ?? "#"}
                  style={{ color: "var(--accent)", textDecoration: "underline" }}
                >
                  {cites.doi}
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <CopyButton text={value} label={label} />
      </div>
      <pre
        style={{
          background: "var(--code-bg)",
          color: "var(--code-text)",
          padding: 12,
          borderRadius: 6,
          fontSize: 12.5,
          lineHeight: 1.55,
          fontFamily: FONT_MONO,
          overflow: "auto",
          margin: 0,
          whiteSpace: "pre-wrap",
        }}
      >
        {value}
      </pre>
    </div>
  );
}

const fieldLabelSty: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabelTextSty: React.CSSProperties = {
  fontSize: 11,
  fontFamily: FONT_MONO,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  fontWeight: 600,
};

const inputSty: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 6,
  border: "none",
  background: "var(--bg)",
  color: "var(--text)",
  boxShadow: "var(--shadow-ring-light)",
  fontSize: 14,
  fontFamily: "inherit",
};
