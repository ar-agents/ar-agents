import Link from "next/link";
import { JsonLd } from "../json-ld";
import type { Lang } from "../i18n";
import {
  SEED,
  listRecords,
  type RegistryRecord,
  type GoodStandingState,
} from "@/lib/registry-store";

/**
 * Shared bilingual content for `/registro` (ES, default) and
 * `/en/registry` (EN). The entry data is held verbatim, only the
 * surrounding chrome translates. Each entry's `disclosure` carries
 * ES + EN copies because the body is paragraphs of prose.
 *
 * Live conformance fetch + JSON-LD remain server-side here so both
 * URLs share the cache.
 *
 * The entry list comes from lib/registry-store#listRecords() (the SEED
 * array merged with any KV-stored self-listed entries). If KV is down the
 * store falls back to SEED, but we ALSO guard here so a thrown error never
 * 500s the page: on failure we render the SEED directly.
 */

// Local alias kept so the rest of the file reads as before.
type RegistryEntry = RegistryRecord;

const TYPE_COLOR: Record<RegistryEntry["type"], string> = {
  "reference-implementation": "#a855f7",
  demo: "#06b6d4",
  "productive-sociedad-ia": "#22c55e",
  "library-only": "#eab308",
};

const TYPE_LABEL: Record<
  RegistryEntry["type"],
  { es: string; en: string }
> = {
  "reference-implementation": {
    es: "Implementación de referencia",
    en: "Reference impl",
  },
  demo: { es: "Demo", en: "Demo" },
  "productive-sociedad-ia": {
    es: "Sociedad productiva",
    en: "Productive company",
  },
  "library-only": { es: "Sólo librería", en: "Library only" },
};

const STATUS_COLOR: Record<RegistryEntry["status"], string> = {
  live: "#22c55e",
  draft: "#737373",
  deprecated: "#ef4444",
  forming: "#3b82f6",
  stale: "#a3a3a3",
};

const STATUS_LABEL: Record<
  RegistryEntry["status"],
  { es: string; en: string }
> = {
  live: { es: "live", en: "live" },
  draft: { es: "draft", en: "draft" },
  deprecated: { es: "deprecated", en: "deprecated" },
  forming: { es: "en formación", en: "forming" },
  stale: { es: "inactivo", en: "stale" },
};

const GOOD_STANDING_COLOR: Record<GoodStandingState, string> = {
  active: "#22c55e",
  unverified: "#737373",
  suspended: "#f97316",
  revoked: "#ef4444",
};

const GOOD_STANDING_LABEL: Record<
  GoodStandingState,
  { es: string; en: string }
> = {
  active: { es: "buen estado", en: "good standing" },
  unverified: { es: "sin verificar", en: "unverified" },
  suspended: { es: "suspendido", en: "suspended" },
  revoked: { es: "revocado", en: "revoked" },
};

interface HistoryPoint {
  ts: string;
  score: number;
  rating: string;
}

async function fetchHistory(url: string): Promise<HistoryPoint[]> {
  if (!url || url === "-") return [];
  try {
    const r = await fetch(
      `https://ar-agents.ar/api/conformance-history?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(5000), next: { revalidate: 600 } },
    );
    if (!r.ok) return [];
    const d = (await r.json()) as { points?: HistoryPoint[] };
    return d.points ?? [];
  } catch {
    return [];
  }
}

function Sparkline({ points }: { points: HistoryPoint[] }) {
  if (points.length === 0) return null;
  const w = 100;
  const h = 22;
  const pad = 2;
  const min = Math.min(...points.map((p) => p.score), 0);
  const max = Math.max(...points.map((p) => p.score), 100);
  const range = max - min || 1;
  const xs = points.map((_p, i) =>
    points.length === 1
      ? w / 2
      : pad + (i / (points.length - 1)) * (w - pad * 2),
  );
  const ys = points.map(
    (p) => h - pad - ((p.score - min) / range) * (h - pad * 2),
  );
  const d = points
    .map(
      (_p, i) =>
        `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`,
    )
    .join(" ");
  const last = points[points.length - 1];
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];
  const color =
    last.rating === "A"
      ? "#22c55e"
      : last.rating === "B"
        ? "#84cc16"
        : last.rating === "C"
          ? "#eab308"
          : last.rating === "D"
            ? "#f97316"
            : "#ef4444";
  return (
    <svg
      width={w}
      height={h}
      role="img"
      aria-label={`Conformance score trend, ${points.length} points, latest ${last.score} ${last.rating}`}
      style={{ display: "block" }}
    >
      <title>
        {`Score trend (${points.length} pts) · latest ${last.score}/${last.rating}`}
      </title>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

const T = (lang: Lang) => ({
  eyebrow:
    lang === "es"
      ? "/registro · público · auto-listado · 2026-05-11"
      : "/registry · public · self-listed · 2026-05-11",
  title:
    lang === "es"
      ? "Registro público de implementaciones."
      : "Public registry of implementations.",
  intro:
    lang === "es"
      ? "Cada sociedad automatizada o demo argentina que implementa RFC-001..004 puede listarse aquí."
      : "Every Argentine automated company or demo that implements RFC-001..004 can be listed here.",
  metadataOnly:
    lang === "es"
      ? "Metadata pública únicamente"
      : "Public metadata only",
  metadataDetail:
    lang === "es"
      ? ": sin números de clientes, sin facturación, sin PII. Auto-suscripción vía PR a "
      : ": no customer counts, no revenue, no PII. Self-listing via PR at ",
  disclosureLabel:
    lang === "es" ? "Disclosure honesto." : "Honest disclosure.",
  disclosureBody1:
    lang === "es"
      ? " Hoy las 5 entradas listadas son operadas por la misma persona (Nazareno Clemente). "
      : " Today the 5 listed entries are all operated by the same person (Nazareno Clemente). ",
  disclosureBody2:
    lang === "es"
      ? "Esto NO es un ecosistema multi-operador"
      : "This is NOT a multi-operator ecosystem",
  disclosureBody3:
    lang === "es"
      ? ", es una reference implementation + 4 demos del autor del proyecto. Cero (0) sociedades automatizadas productivas (con clientes reales, facturas reales, cobros reales): la figura legal (Sociedad Automatizada, art. 14 del Anteproyecto de Ley General de Sociedades) tiene texto firmado el 28-may-2026 y está en el Senado desde el 1-jun-2026, pero todavía no es ley, así que el régimen aún no existe jurídicamente. Cuando un tercero adopte los RFCs y opere bajo su propio CUIT, su entrada se sumará vía PR. Mientras tanto, lo que ves es: una propuesta técnica completa, validada end-to-end por una sola persona."
      : ", it is a reference implementation + 4 demos by the project author. Zero (0) productive automated companies (with real customers, real invoices, real collections): the legal figure (Sociedad Automatizada, art. 14 of the Anteproyecto de Ley General de Sociedades) has a text signed on 28-may-2026 and has been in the Senate since 1-jun-2026, but it is not yet law, so the regime does not legally exist yet. When a third party adopts the RFCs and operates under its own CUIT, their entry will be added via PR. In the meantime, what you see is a complete technical proposal validated end-to-end by a single person.",
  counters: {
    refImpl:
      lang === "es" ? "Implementación de referencia" : "Reference impl",
    demos: lang === "es" ? "Demos en vivo" : "Demos live",
    productive:
      lang === "es"
        ? "Sociedades productivas"
        : "Productive companies",
    total: lang === "es" ? "Total en vivo" : "Total live",
  },
  howToAdd:
    lang === "es" ? "Cómo agregar tu sociedad automatizada" : "How to add your automated company",
  steps: {
    step1: {
      pre: lang === "es" ? "Asegurate de que tu sociedad automatizada serve " : "Make sure your automated company serves ",
      post:
        lang === "es"
          ? " con metadata pública (RFC-002)."
          : " with public metadata (RFC-002).",
    },
    step2: {
      pre:
        lang === "es"
          ? "Asegurate de que tu endpoint de auditoría retorna entradas firmadas que pasan los vectores de conformidad RFC-004 ("
          : "Make sure your audit endpoint returns signed entries that pass the RFC-004 conformance vectors (",
      post:
        lang === "es"
          ? ").": ").",
    },
    step3: {
      pre:
        lang === "es"
          ? "Abrí un PR a "
          : "Open a PR at ",
      mid:
        lang === "es"
          ? " modificando "
          : " modifying ",
      post:
        lang === "es"
          ? " con tu entrada."
          : " with your entry.",
    },
    step4:
      lang === "es"
        ? "El PR se aprueba si los endpoints declarados responden + el disclosure es honesto. Sin más requisitos."
        : "The PR is approved if the declared endpoints respond + the disclosure is honest. No further requirements.",
  },
  listedSince:
    lang === "es" ? "listado desde" : "listed since",
  selfListTitle:
    lang === "es"
      ? "O auto-listate por API (sin PR)"
      : "Or self-list via API (no PR)",
  selfListIntro:
    lang === "es"
      ? "Hacé un POST a "
      : "POST to ",
  selfListBody:
    lang === "es"
      ? " con tu metadata. El servidor corre el certificador contra tu URL declarada y te devuelve un token de propietario (una sola vez). Tu entrada nace en draft / sin verificar y pasa a live / buen estado solo cuando el certificador puntúa ≥ C (60) sobre los endpoints que vos declarás. Es conformidad automática de endpoints declarados, no un juicio de solvencia, identidad ni fraude; el CUIT auto-declarado queda fuera de la afirmación de confianza hasta verificarse."
      : " with your metadata. The server runs the certifier against your declared URL and returns a write-once owner token. Your entry starts draft / unverified and auto-flips to live / good standing only when the certifier scores ≥ C (60) over the endpoints you declare. This is automated conformance of self-declared endpoints, not a solvency, identity, or fraud judgement; a self-declared CUIT stays outside the trust claim until verified.",
  oracleTitle:
    lang === "es"
      ? "Oracle público de buen estado"
      : "Public good-standing oracle",
  oracleBody:
    lang === "es"
      ? "Cualquier contraparte (banco, PSP, marketplace, framework de agentes) puede consultar el estado de una entrada antes de transaccionar: "
      : "Any counterparty (bank, PSP, marketplace, agent framework) can query an entry's standing before transacting: ",
  oracleBody2:
    lang === "es"
      ? ". Devuelve una respuesta chica, cacheable y firmada con Ed25519, verificable offline con arg-verify; la firma de ar-agents es conveniencia, la confianza de fondo son los anclajes públicos del propio target que el oracle reenvía."
      : ". It returns a small, cacheable, Ed25519-signed answer, offline-verifiable with arg-verify; the ar-agents signature is convenience, the load-bearing trust is the target's own public anchors that the oracle forwards.",
});

export async function RegistroContent({ lang }: { lang: Lang }) {
  // Source of truth: the registry store (SEED merged with KV self-listings).
  // listRecords() already falls back to SEED on KV errors, but we guard once
  // more so a thrown error here never 500s the shared page render.
  let REGISTRY: RegistryEntry[];
  try {
    REGISTRY = await listRecords();
  } catch {
    REGISTRY = [...SEED];
  }

  const histories = await Promise.all(
    REGISTRY.map(async (e) =>
      e.status === "live" && e.publicUrl !== "-"
        ? await fetchHistory(e.publicUrl)
        : [],
    ),
  );
  const historyById = new Map<string, HistoryPoint[]>();
  REGISTRY.forEach((e, i) => historyById.set(e.id, histories[i]));

  const counts = REGISTRY.reduce(
    (acc, e) => {
      if (e.status === "live") acc[e.type]++;
      return acc;
    },
    {
      "reference-implementation": 0,
      demo: 0,
      "productive-sociedad-ia": 0,
      "library-only": 0,
    } as Record<RegistryEntry["type"], number>,
  );

  const t = T(lang);
  const canonical =
    lang === "es"
      ? "https://ar-agents.ar/registro"
      : "https://ar-agents.ar/en/registry";

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name:
            lang === "es"
              ? "Registro de implementaciones AR sociedad automatizada"
              : "Registry of known AR automated company implementations",
          url: canonical,
          numberOfItems: REGISTRY.filter((e) => e.status === "live").length,
          itemListElement: REGISTRY.filter((e) => e.status === "live").map(
            (e, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "SoftwareApplication",
                name: e.name,
                url: e.publicUrl,
                applicationCategory: TYPE_LABEL[e.type][lang],
                description: e.disclosure[lang],
              },
            }),
          ),
        }}
      />

      <main
        style={{
          maxWidth: 920,
          margin: "0 auto",
          padding: "48px 24px 96px",
          color: "var(--text-body)",
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        <header style={{ marginBottom: 32 }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 8,
            }}
          >
            {t.eyebrow}
          </p>
          <h1
            style={{
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 500,
              color: "var(--text-strong)",
              marginBottom: 12,
              letterSpacing: "-0.01em",
            }}
          >
            {t.title}
          </h1>
          <p style={{ fontSize: 16 }}>
            {t.intro} <strong>{t.metadataOnly}</strong>
            {t.metadataDetail}
            <a
              href="https://github.com/ar-agents/ar-agents"
              style={linkStyle}
            >
              github.com/ar-agents/ar-agents
            </a>
            .
          </p>
        </header>

        <div
          style={{
            padding: 14,
            background: "var(--bg-tint)",
            borderLeft: "3px solid var(--text-muted)",
            borderRadius: 4,
            marginBottom: 24,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--text-muted)",
          }}
          role="note"
        >
          <strong style={{ color: "var(--text-body)" }}>
            {t.disclosureLabel}
          </strong>
          {t.disclosureBody1}
          <strong style={{ color: "var(--text-body)" }}>
            {t.disclosureBody2}
          </strong>
          {t.disclosureBody3}
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 32,
          }}
        >
          <Counter
            n={counts["reference-implementation"]}
            label={t.counters.refImpl}
            color={TYPE_COLOR["reference-implementation"]}
          />
          <Counter
            n={counts["demo"]}
            label={t.counters.demos}
            color={TYPE_COLOR["demo"]}
          />
          <Counter
            n={counts["productive-sociedad-ia"]}
            label={t.counters.productive}
            color={TYPE_COLOR["productive-sociedad-ia"]}
          />
          <Counter
            n={REGISTRY.filter((e) => e.status === "live").length}
            label={t.counters.total}
            color="#737373"
          />
        </section>

        <section>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {REGISTRY.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                history={historyById.get(entry.id) ?? []}
                lang={lang}
                listedSinceLabel={t.listedSince}
              />
            ))}
          </ul>
        </section>

        <section
          style={{
            marginTop: 40,
            paddingTop: 24,
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <h2
            style={{
              fontSize: 18,
              marginBottom: 12,
              fontWeight: 500,
              color: "var(--text-strong)",
            }}
          >
            {t.howToAdd}
          </h2>
          <ol style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li style={liStyle}>
              {t.steps.step1.pre}
              <code style={codeStyle}>/.well-known/agents.json</code>
              {t.steps.step1.post}
            </li>
            <li style={liStyle}>
              {t.steps.step2.pre}
              <Link href="/test-vectors" style={linkStyle}>
                /test-vectors
              </Link>
              {t.steps.step2.post}
            </li>
            <li style={liStyle}>
              {t.steps.step3.pre}
              <a
                href="https://github.com/ar-agents/ar-agents"
                style={linkStyle}
              >
                github.com/ar-agents/ar-agents
              </a>
              {t.steps.step3.mid}
              <code style={codeStyle}>
                apps/landing/src/app/registro/page.tsx
              </code>
              {t.steps.step3.post}
            </li>
            <li style={liStyle}>{t.steps.step4}</li>
          </ol>

          <h3
            style={{
              fontSize: 15,
              marginTop: 24,
              marginBottom: 8,
              fontWeight: 500,
              color: "var(--text-strong)",
            }}
          >
            {t.selfListTitle}
          </h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 16 }}>
            {t.selfListIntro}
            <code style={codeStyle}>POST /api/registry</code>
            {t.selfListBody}
          </p>

          <h3
            style={{
              fontSize: 15,
              marginTop: 24,
              marginBottom: 8,
              fontWeight: 500,
              color: "var(--text-strong)",
            }}
          >
            {t.oracleTitle}
          </h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            {t.oracleBody}
            <code style={codeStyle}>
              GET /api/registry/good-standing?url=
            </code>
            {t.oracleBody2}
          </p>
        </section>

        <footer
          style={{
            marginTop: 64,
            paddingTop: 24,
            borderTop: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          ar-agents.ar ·{" "}
          <Link href="/rfcs/002" style={linkStyle}>
            RFC-002
          </Link>
          {" · "}
          <Link href="/test-vectors" style={linkStyle}>
            /test-vectors
          </Link>
          {" · "}
          <Link
            href={lang === "es" ? "/auditor" : "/en/auditor"}
            style={linkStyle}
          >
            {lang === "es" ? "/auditor" : "/en/auditor"}
          </Link>
          {" · "}
          <Link href="/" style={linkStyle}>
            /
          </Link>
        </footer>
      </main>
    </>
  );
}

function Counter({
  n,
  label,
  color,
}: {
  n: number;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: 14,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 300,
          color: "var(--text-strong)",
          fontFamily:
            "var(--font-geist-mono), ui-monospace, monospace",
          lineHeight: 1.1,
        }}
      >
        {n}
      </div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Entry({
  entry,
  history,
  lang,
  listedSinceLabel,
}: {
  entry: RegistryEntry;
  history: HistoryPoint[];
  lang: Lang;
  listedSinceLabel: string;
}) {
  return (
    <li
      style={{
        padding: 16,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        marginBottom: 12,
        borderLeft: `3px solid ${TYPE_COLOR[entry.type]}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "var(--text-strong)",
            }}
          >
            {entry.name}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {entry.jurisdiction} · {entry.operator}
            {entry.operatorCuit ? ` · CUIT ${entry.operatorCuit}` : ""}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexShrink: 0,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Badge
            text={TYPE_LABEL[entry.type][lang]}
            color={TYPE_COLOR[entry.type]}
          />
          <Badge
            text={STATUS_LABEL[entry.status][lang]}
            color={STATUS_COLOR[entry.status]}
          />
          <Badge
            text={
              GOOD_STANDING_LABEL[entry.goodStanding.state][lang] +
              (entry.goodStanding.lastRating &&
              entry.goodStanding.lastRating !== "N/A"
                ? ` · ${entry.goodStanding.lastRating}`
                : "")
            }
            color={GOOD_STANDING_COLOR[entry.goodStanding.state]}
          />
        </div>
      </div>

      <p
        style={{
          fontSize: 13.5,
          marginBottom: 8,
          color: "var(--text-body)",
        }}
      >
        {entry.disclosure[lang]}
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          fontSize: 12,
          color: "var(--text-muted)",
          alignItems: "center",
        }}
      >
        {entry.publicUrl !== "-" && (
          <a href={entry.publicUrl} style={linkStyle}>
            {entry.publicUrl}
          </a>
        )}
        {entry.rfcConformance.length > 0 && (
          <span>
            · RFCs:{" "}
            <code style={codeStyle}>
              {entry.rfcConformance.join(", ")}
            </code>
          </span>
        )}
        {entry.listedSince !== "-" && (
          <span>
            · {listedSinceLabel} {entry.listedSince}
          </span>
        )}
        {entry.publicUrl !== "-" && entry.status === "live" && (
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {history.length > 0 && (
              <a
                href={`/api/conformance-history?url=${encodeURIComponent(entry.publicUrl)}`}
                title={`${history.length}-point trend · latest ${history[history.length - 1].score}/${history[history.length - 1].rating}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  textDecoration: "none",
                }}
                aria-label={`Conformance score trend for ${entry.name}`}
              >
                <Sparkline points={history} />
              </a>
            )}
            <a
              href={`/certifier?url=${encodeURIComponent(entry.publicUrl)}`}
              style={{
                display: "flex",
                alignItems: "center",
                textDecoration: "none",
              }}
              aria-label={`Live RFC-002+004 conformance badge for ${entry.name}`}
              title="Click to run live certification"
            >
              <img
                src={`/api/cert-badge?url=${encodeURIComponent(entry.publicUrl)}`}
                alt={`Conformance score for ${entry.name}`}
                width="180"
                height="22"
                loading="lazy"
                style={{ display: "block", borderRadius: 4 }}
              />
            </a>
          </div>
        )}
      </div>
    </li>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "3px 8px",
        background: `${color}22`,
        color,
        borderRadius: 4,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 12,
  padding: "1px 4px",
  background: "var(--bg)",
  borderRadius: 3,
};

const liStyle: React.CSSProperties = {
  marginBottom: 6,
  lineHeight: 1.55,
};
