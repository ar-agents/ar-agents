/**
 * `/constancia/[cuit]`, the public, shareable proof page for one CUIT.
 *
 * This is where the badge links. It shows:
 *   - the free check-digit verdict (válida / no válida) from @ar-agents/identity,
 *   - the good-standing state from @ar-agents/constancia (honestly premium-gated
 *     while no Browserbase fetcher is wired),
 *   - the live badge, an "embed it" snippet (markdown + HTML img), and share
 *     buttons.
 *
 * Server component. `params` is a Promise (async params, this Next version).
 * Runtime nodejs to match the KV-backed surfaces.
 */

import type { Metadata } from "next";
import { parseCuit, describePersonType } from "@ar-agents/identity";
import { normalizeCuit } from "@ar-agents/constancia";
import {
  extractAttribution,
  getConstanciaFetcher,
  isFetcherConfigured,
  recordConstanciaEvent,
} from "@/lib/constancia";
import { headers } from "next/headers";
import Link from "next/link";
import { ProofShare } from "./proof-share";
import { ConstanciaProofJsonLd } from "@/app/json-ld";
import { buildConstanciaAttestation } from "@/lib/constancia-attestation";

export const runtime = "nodejs";

const SITE_URL = "https://ar-agents.ar";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const FONT_SANS =
  "var(--font-geist-sans), Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cuit: string }>;
}): Promise<Metadata> {
  const { cuit } = await params;
  const parsed = parseCuit(cuit);
  const bare = normalizeCuit(cuit) ?? parsed.normalized;
  const pretty = parsed.formatted ?? bare;
  const verdict = parsed.valid ? "CUIT válido" : "CUIT no válido";
  return {
    title: `Constancia ${pretty} · ${verdict}`,
    description: parsed.valid
      ? `El CUIT ${pretty} pasa el dígito verificador. Verificado por ar-agents, con badge para embeber.`
      : `El CUIT ${pretty} no pasa el dígito verificador. Verificado por ar-agents.`,
    alternates: { canonical: `${SITE_URL}/constancia/${bare}` },
    // Index a per-CUIT page only once it carries real, unique constancia data:
    // a valid CUIT AND a wired good-standing backend. While the verdict backend
    // is dormant these pages are thin + near-duplicate, so we keep them out of
    // the index (honest, and avoids a thin-content signal). They flip to
    // indexable automatically the moment the AFIP fetcher is configured.
    robots: {
      index: parsed.valid && isFetcherConfigured(),
      follow: true,
    },
    openGraph: {
      title: `Constancia ${pretty}`,
      description: `${verdict}. Verificado por ar-agents.`,
      url: `${SITE_URL}/constancia/${bare}`,
      type: "website",
    },
  };
}

export default async function ConstanciaProofPage({
  params,
  searchParams,
}: {
  params: Promise<{ cuit: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { cuit } = await params;
  const parsed = parseCuit(cuit);
  const bare = normalizeCuit(cuit) ?? parsed.normalized;
  const pretty = parsed.formatted ?? bare;

  // Record the proof-view as an acquisition signal (best-effort, no throw).
  // Rebuild a Request carrying both the Referer header AND the utm/ref query
  // params, so tagged links (e.g. seed-* click-throughs) attribute correctly.
  try {
    const [hdrs, sp] = await Promise.all([headers(), searchParams]);
    const qs = new URLSearchParams();
    for (const key of ["utm_source", "utm_medium", "ref"]) {
      const v = sp[key];
      if (typeof v === "string" && v) qs.set(key, v);
    }
    const fakeReq = new Request(
      `${SITE_URL}/constancia/${bare}${qs.size ? `?${qs}` : ""}`,
      { headers: { referer: hdrs.get("referer") ?? "" } },
    );
    await recordConstanciaEvent("proof_view", bare, extractAttribution(fakeReq));
  } catch {
    // never let instrumentation break the page
  }

  // Good-standing: real when a fetcher is wired, honestly gated otherwise.
  let verdictAvailable = false;
  let reason: string | null = null;
  let goodStanding: Awaited<
    ReturnType<ReturnType<typeof getConstanciaFetcher>["getConstancia"]>
  >["data"] = null;
  let attSource: "padron-soap" | "browse-skill" = "padron-soap";
  if (parsed.valid) {
    try {
      const constancia = await getConstanciaFetcher().getConstancia(bare);
      verdictAvailable = constancia.available;
      goodStanding = constancia.available ? constancia.data : null;
      if (constancia.source === "browse-skill") attSource = "browse-skill";
      reason = constancia.available
        ? null
        : isFetcherConfigured()
          ? constancia.error
          : "La buena situación fiscal real de ARCA es premium. Todavía no hay un fetcher configurado en este deployment.";
    } catch {
      reason = "El servicio de constancia no respondió.";
    }
  } else {
    reason = "No consultamos ARCA: el CUIT no pasa el dígito verificador.";
  }

  const badgeUrl = `${SITE_URL}/api/constancia/badge/${bare}`;
  const proofUrl = `${SITE_URL}/constancia/${bare}`;
  const valid = parsed.valid;

  // Sign the result. This is what makes "Firmada" true: a verifiable Ed25519
  // statement of exactly what we checked (check digit always, good standing
  // only when real). null when no signing key is configured.
  const attestation = await buildConstanciaAttestation({
    cuit: bare,
    checkDigitValid: valid,
    goodStanding:
      verdictAvailable && goodStanding
        ? {
            source: attSource,
            condicion: goodStanding.condicion,
            ...(goodStanding.denominacion
              ? { denominacion: goodStanding.denominacion }
              : {}),
            ...(goodStanding.estado ? { estado: goodStanding.estado } : {}),
          }
        : null,
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: FONT_SANS,
        padding: "48px 24px 100px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <ConstanciaProofJsonLd
          cuit={bare}
          pretty={pretty}
          valid={valid}
          verdictAvailable={verdictAvailable}
          denominacion={goodStanding?.denominacion ?? null}
        />
        <p
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: 0,
          }}
        >
          Constancia Oracle · ar-agents
        </p>

        {/* Verdict header */}
        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              fontSize: 22,
              background: valid ? "var(--success-bg)" : "var(--danger-bg)",
              color: valid ? "var(--success)" : "var(--danger)",
              flex: "0 0 auto",
            }}
          >
            {valid ? "✓" : "✕"}
          </span>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(26px, 5vw, 38px)",
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
              }}
            >
              {valid ? "CUIT válido" : "CUIT no válido"}
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                fontFamily: FONT_MONO,
                fontSize: 17,
                color: "var(--text-body)",
              }}
            >
              {pretty}
            </p>
          </div>
        </div>

        {/* Live badge */}
        <div
          style={{
            marginTop: 26,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={badgeUrl}
            alt={`constancia: ${valid ? "válida" : "no válida"}`}
            height={20}
            style={{ display: "block" }}
          />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Verificado por ar-agents
          </span>
        </div>

        {/* Detail card */}
        <section
          style={{
            marginTop: 30,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: 20,
            background: "var(--bg-tint)",
          }}
        >
          <Row label="Dígito verificador">
            <strong style={{ color: valid ? "var(--success)" : "var(--danger)" }}>
              {valid ? "pasa" : "no pasa"}
            </strong>
            {!valid && parsed.error ? (
              <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                {parsed.error}
              </span>
            ) : null}
          </Row>
          <Row label="Tipo">
            {describePersonType(parsed.personType)}
          </Row>
          <Row label="Buena situación fiscal (ARCA)">
            {verdictAvailable && goodStanding ? (
              <span style={{ color: "var(--success)" }}>
                {goodStanding.denominacion} · {goodStanding.condicion}
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: FONT_MONO,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--warning-bg)",
                    color: "var(--warning)",
                  }}
                >
                  premium
                </span>
                <span style={{ color: "var(--text-muted)" }}>{reason}</span>
              </span>
            )}
          </Row>
        </section>

        {/* Signed attestation (this is what "Firmada" means, and it verifies) */}
        {attestation ? (
          <section
            style={{
              marginTop: 22,
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "var(--success-bg)",
                  color: "var(--success)",
                }}
              >
                Firmada
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: FONT_MONO,
                  color: "var(--text-muted)",
                }}
              >
                Ed25519 · {attestation.signature.keyId}
              </span>
            </div>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--text-body)",
              }}
            >
              {attestation.body.statement}
            </p>
            <p
              style={{
                margin: 0,
                fontFamily: FONT_MONO,
                fontSize: 11,
                color: "var(--text-muted)",
                wordBreak: "break-all",
              }}
            >
              sig: {attestation.signature.value.slice(0, 40)}…
            </p>
            <div
              style={{
                marginTop: 14,
                display: "flex",
                gap: 18,
                flexWrap: "wrap",
                fontSize: 13,
              }}
            >
              <a
                href={`${SITE_URL}/api/constancia/attestation/${bare}`}
                style={{ color: "var(--accent)" }}
              >
                Attestación JSON
              </a>
              <a
                href={`${SITE_URL}/.well-known/sociedad-ia/keys`}
                style={{ color: "var(--accent)" }}
              >
                Clave pública
              </a>
              <span style={{ color: "var(--text-muted)" }}>
                Verificable offline, sin confiar en este servidor.
              </span>
            </div>
          </section>
        ) : null}

        {/* Embed + share (client) */}
        <ProofShare
          badgeUrl={badgeUrl}
          proofUrl={proofUrl}
          pretty={pretty}
          valid={valid}
        />

        <p
          style={{
            marginTop: 36,
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          La validez del dígito verificador es un cálculo abierto (módulo 11),
          no consulta ningún padrón. La buena situación fiscal real de ARCA es
          la capa premium.{" "}
          <Link href="/constancia" style={{ color: "var(--accent)" }}>
            Volver al Oracle
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        padding: "10px 0",
        borderBottom: "1px solid var(--border-light)",
        fontSize: 15,
      }}
    >
      <span
        style={{
          flex: "0 0 220px",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        {label}
      </span>
      <span style={{ flex: "1 1 240px", minWidth: 0 }}>{children}</span>
    </div>
  );
}
