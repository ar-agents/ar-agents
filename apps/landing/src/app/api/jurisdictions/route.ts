/**
 * `GET /api/jurisdictions`, machine-readable comparison of AR proposal vs
 * established regimes for algorithmic entities (Wyoming DAO LLC, Marshall
 * Islands MIDAO, Estonia e-Residency, Singapore VCC + AI Verify).
 *
 * Mirror of /jurisdicciones. Designed for journalists, researchers,
 * legislative drafters to consume the table programmatically. Each row
 * lists what each jurisdiction has for a given layer (identity, signature,
 * registry, audit log, citable spec, incorporation cost, OSS posture).
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

interface Row {
  layer: string;
  argentina: { description: string; status: "proposal" | "operational" };
  wyoming: { description: string; reference: string };
  marshallIslands: { description: string; reference: string };
  estonia: { description: string; reference: string };
  singapore: { description: string; reference: string };
}

const ROWS: ReadonlyArray<Row> = [
  {
    layer: "Identity",
    argentina: {
      description:
        "CUIT + Clave Fiscal Nivel 3-4 (AFIP/ARCA). Padrón consultable. @ar-agents/identity wraps it.",
      status: "operational",
    },
    wyoming: {
      description:
        "Filed entity with statement of DAO + smart-contract URL on Articles of Organization.",
      reference: "Wyoming Statutes Title 17 §17-31-106",
    },
    marshallIslands: {
      description:
        "DAO LLC with operating agreement referencing smart contract. Registered agent (MIDAO) required.",
      reference: "RMI DAO Act 2022",
    },
    estonia: {
      description:
        "e-Residency: smartcard + Mobile-ID. eIDAS qualified electronic signature. Public Äriregister API.",
      reference: "eIDAS Regulation (EU 910/2014)",
    },
    singapore: {
      description:
        "VCC under ACRA. Mandatory KYC + AML. AI Verify for AI system audit, separate from corporate registry.",
      reference: "VCC Act 2018",
    },
  },
  {
    layer: "Signature with probative value",
    argentina: {
      description:
        "Firma Digital Ley 25.506 + X.509 cert from ARCA. CMS/PKCS#7. @ar-agents/firma-digital verifies.",
      status: "operational",
    },
    wyoming: {
      description:
        "Smart contract signatures (Ethereum addresses) + multisig. No federal probative-value standard.",
      reference: "Title 17 §17-31-106",
    },
    marshallIslands: {
      description:
        "Operating agreement signed by members + on-chain transactions. No explicit normative spec.",
      reference: "RMI DAO Regulations 2024",
    },
    estonia: {
      description:
        "ASiC-E / BDOC containers with XAdES signatures (ETSI standards). EU-wide probative value.",
      reference: "ETSI EN 319 162-1",
    },
    singapore: {
      description:
        "Singapore Standards CA with e-signature framework. ACRA-verified directors.",
      reference: "Electronic Transactions Act",
    },
  },
  {
    layer: "Public registry",
    argentina: {
      description:
        "IGJ (Inspección General de Justicia), open data at datos.jus.gob.ar. @ar-agents/igj wraps CKAN.",
      status: "operational",
    },
    wyoming: {
      description:
        "Wyoming Secretary of State business search. Free, web-only, no documented API.",
      reference: "sos.wyo.gov",
    },
    marshallIslands: {
      description:
        "registry.midao.org/public-registry, search box, no public API.",
      reference: "midao.org",
    },
    estonia: {
      description:
        "Äriregister via X-Road (open-source data exchange). Full API, free, downloadable.",
      reference: "rik.ee company-registration-api",
    },
    singapore: {
      description:
        "ACRA BizFile+, paid API, comprehensive corporate data.",
      reference: "acra.gov.sg",
    },
  },
  {
    layer: "Normative audit log",
    argentina: {
      description:
        "RFC-004 proposes append-only HMAC + Ed25519 dual-sign. Hex-exact test vectors at /test-vectors.",
      status: "proposal",
    },
    wyoming: {
      description:
        "Smart contract events on-chain, immutable by default. No normative spec for log structure.",
      reference: "-",
    },
    marshallIslands: {
      description: "Same as Wyoming, trust in the chain. No unified schema.",
      reference: "-",
    },
    estonia: {
      description:
        "X-Road centralized logs. Each transaction signed, timestamped, replicable.",
      reference: "e-estonia.com/x-road",
    },
    singapore: {
      description:
        "AI Verify Toolkit produces structured reports (Python, open-source). Not native audit log for the entity.",
      reference: "aiverifyfoundation.sg",
    },
  },
  {
    layer: "Citable spec",
    argentina: {
      description:
        "RFC-001..006, open-source drafts, CC-BY-4.0. Today NO DOI / institutional archive. Explicit disclaimer on each RFC. Zenodo archival on roadmap.",
      status: "proposal",
    },
    wyoming: {
      description:
        "Wyoming Statutes Title 17 Chapter 31, state federal law. Immediately citable.",
      reference: "law.justia.com/codes/wyoming/title-17/chapter-31",
    },
    marshallIslands: {
      description:
        "RMI DAO Act 2022 + DAO Regulations 2024. Citable by act number.",
      reference: "rmi-dao-act-2022",
    },
    estonia: {
      description:
        "eIDAS Regulation (EU 910/2014) + ETSI standards. Multi-level: EU law + technical norms.",
      reference: "eur-lex.europa.eu",
    },
    singapore: {
      description: "VCC Act 2018 (statutory) + AI Verify open-source framework.",
      reference: "sso.agc.gov.sg/Act/VCCA2018",
    },
  },
  {
    layer: "Incorporation cost",
    argentina: {
      description:
        "Sociedad-IA does not yet exist legally. Standard SAS today: IGJ fees + notary (~USD 200-500).",
      status: "proposal",
    },
    wyoming: {
      description:
        "USD 100 + USD 50/year renewal + registered agent (~USD 100-200).",
      reference: "wyobiz.wyo.gov",
    },
    marshallIslands: {
      description: "USD 6,000-9,500 incorporation + USD 2,000-5,000 annual.",
      reference: "midao.org/pricing",
    },
    estonia: {
      description: "EUR 25 + VAT per company. e-Residency card ~EUR 100-120.",
      reference: "e-resident.gov.ee/start-a-company",
    },
    singapore: {
      description:
        "SGD 300 incorporation + nominee director required (~SGD 1,500-3,000/year).",
      reference: "acra.gov.sg",
    },
  },
  {
    layer: "Open-source posture",
    argentina: {
      description:
        "Everything: 36 packages MIT, 6 RFCs CC-BY-4.0, audit lib reference.",
      status: "operational",
    },
    wyoming: {
      description:
        "Statute is public domain. No official reference implementation, third parties like Otonomos.",
      reference: "-",
    },
    marshallIslands: {
      description: "Statute public. MIDAO operation closed (PPP).",
      reference: "-",
    },
    estonia: {
      description:
        "X-Road open-source (Apache 2.0). DigiDoc4 client open-source. Whole stack is OSS.",
      reference: "github.com/nordic-institute/X-Road",
    },
    singapore: {
      description:
        "AI Verify Toolkit open-source (Apache 2.0). VCC framework proprietary.",
      reference: "github.com/aiverify-foundation",
    },
  },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const layerFilter = url.searchParams.get("layer")?.toLowerCase();

  const entries = layerFilter
    ? ROWS.filter((r) => r.layer.toLowerCase().includes(layerFilter))
    : ROWS.slice();

  return NextResponse.json(
    {
      $schema:
        "https://ar-agents.ar/schemas/jurisdictions.v1.json",
      generated: new Date().toISOString(),
      description:
        "Side-by-side comparison of the proposed Argentine sociedad-IA regime against four established regimes for algorithmic / non-resident entities. Layers: identity, signature, registry, audit log, citable spec, incorporation cost, OSS posture.",
      jurisdictions: [
        "Argentina (proposal)",
        "Wyoming DAO LLC",
        "Marshall Islands MIDAO",
        "Estonia e-Residency",
        "Singapore VCC + AI Verify",
      ],
      filters: { layer: layerFilter ?? null },
      caveats: [
        "Argentina's sociedad-IA regime is announced but not enacted. Comparison reflects what ar-agents proposes, not what current AR law has.",
        "Cost figures are approximate and exclude bank account setup, ongoing accounting, and operator personal taxes.",
        "Estonia e-Residency does not confer tax residency or banking access; it is an identity primitive.",
      ],
      rows: entries,
      humanReadable: "https://ar-agents.ar/jurisdicciones",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
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
      "Access-Control-Allow-Origin": "*",
    },
  });
}
