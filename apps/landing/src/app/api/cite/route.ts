/**
 * `GET /api/cite?rfc={001..005}&commit={hash}`, machine-readable
 * citation generator. Returns BibTeX / APA / Chicago citations for
 * a given RFC anchored to an immutable commit hash on GitHub.
 *
 * Companion to /cite (UI). The adversarial regulator review flagged
 * cite-by-reference as legally inviable when the canonical URL is
 * mutable; this endpoint produces the workaround a legislative
 * drafter or scholar would use.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

interface RfcMeta {
  id: string;
  title: string;
  titleEn: string;
  date: string;
  doi: string;
}

const RFCS: ReadonlyArray<RfcMeta> = [
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
];

const DEFAULT_COMMIT = "9e55f82f12e5b3017f165c7b4f9f144b68868512";

function buildCitations(rfc: RfcMeta, commit: string) {
  const short = commit.slice(0, 7);
  const year = rfc.date.slice(0, 4);
  const month = rfc.date.slice(5, 7);
  const url = `https://github.com/ar-agents/ar-agents/blob/${commit}/apps/landing/src/app/rfcs/${rfc.id}/page.tsx`;
  const canonical = `https://ar-agents.ar/rfcs/${rfc.id}`;
  const doiUrl = `https://doi.org/${rfc.doi}`;

  const bibtex = `@misc{ar-agents-rfc-${rfc.id}-${short},
  title  = {{RFC-${rfc.id}: ${rfc.title}}},
  author = {{Clemente, Nazareno}},
  year   = {${year}},
  month  = {${month}},
  doi    = {${rfc.doi}},
  url    = {${doiUrl}},
  note   = {ar-agents Open Infrastructure for Argentine AI corporations. Commit ${short}. Canonical: ${canonical}. License: CC-BY-4.0.}
}`;

  const apa = `Clemente, N. (${year}). RFC-${rfc.id}: ${rfc.title} (Version ${short}) [Technical specification]. ar-agents. ${doiUrl}`;

  const chicago = `Clemente, Nazareno. "RFC-${rfc.id}: ${rfc.title}." ar-agents Open Infrastructure for Argentine AI corporations. Version ${short} (${rfc.date}). ${doiUrl}.`;

  return {
    url,
    canonical,
    doi: rfc.doi,
    doiUrl,
    bibtex,
    apa,
    chicago,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rfcId = (url.searchParams.get("rfc") ?? "").replace(/^rfc-?/i, "").padStart(3, "0");
  const commitRaw = (url.searchParams.get("commit") ?? DEFAULT_COMMIT).trim();

  if (!rfcId || !/^[0-9]{3}$/.test(rfcId)) {
    return NextResponse.json(
      {
        error: "invalid_rfc",
        detail:
          "rfc param required; must be one of 001|002|003|004|005 (or '1', '2', ..., leading zeros optional).",
        availableRfcs: RFCS.map((r) => r.id),
      },
      { status: 400 },
    );
  }

  const rfc = RFCS.find((r) => r.id === rfcId);
  if (!rfc) {
    return NextResponse.json(
      {
        error: "unknown_rfc",
        detail: `No RFC with id ${rfcId}. Known: ${RFCS.map((r) => r.id).join(", ")}.`,
      },
      { status: 404 },
    );
  }

  if (!/^[0-9a-f]{7,40}$/i.test(commitRaw)) {
    return NextResponse.json(
      {
        error: "invalid_commit",
        detail: "commit param must be a hex string of 7-40 characters (GitHub commit hash).",
      },
      { status: 400 },
    );
  }

  const cites = buildCitations(rfc, commitRaw);

  return NextResponse.json(
    {
      rfc: rfc.id,
      commit: commitRaw,
      title: rfc.title,
      titleEn: rfc.titleEn,
      author: "Nazareno Clemente",
      date: rfc.date,
      license: "CC-BY-4.0",
      doi: cites.doi,
      doiUrl: cites.doiUrl,
      canonical: cites.canonical,
      url: cites.url,
      bibtex: cites.bibtex,
      apa: cites.apa,
      chicago: cites.chicago,
      caveats: [
        "Drafts, not yet stable. Cite for preparatory legislative discussion, not final articulado.",
        "Each RFC has a stable Zenodo DOI (cite via doiUrl); the GitHub commit hash adds source-level pinning.",
        "Author is a technical maintainer, not a credentialed jurist. Adoption requires legal-professional review.",
      ],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
