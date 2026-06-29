import Link from "next/link";
import { JsonLd } from "../json-ld";
import type { Lang } from "../i18n";

/**
 * Shared bilingual content for `/registro` (ES, default) and
 * `/en/registry` (EN). The entry data is held verbatim, only the
 * surrounding chrome translates. Each entry's `disclosure` carries
 * ES + EN copies because the body is paragraphs of prose.
 *
 * Live conformance fetch + JSON-LD remain server-side here so both
 * URLs share the cache.
 */

interface RegistryEntry {
  name: string;
  type:
    | "reference-implementation"
    | "demo"
    | "productive-sociedad-ia"
    | "library-only";
  jurisdiction: string;
  operator: string;
  operatorCuit?: string;
  publicUrl: string;
  rfcConformance: string[];
  disclosure: { es: string; en: string };
  status: "live" | "draft" | "deprecated";
  listedSince: string;
}

const REGISTRY: ReadonlyArray<RegistryEntry> = [
  {
    name: "ar-agents (this site, reference implementation)",
    type: "reference-implementation",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://ar-agents.ar",
    rfcConformance: [
      "rfc-001-v1",
      "rfc-002-v1",
      "rfc-003-draft",
      "rfc-004-draft",
    ],
    disclosure: {
      es: "Implementación de referencia de la especificación. Aloja /play (demo interactivo), /verify (verificación HMAC), /api/play/audit/* (endpoints de auditoría), /test-vectors (vectores de conformidad). No es una sociedad productiva, no transacciona con clientes reales, no emite facturas, no cobra. Fuente de verdad del spec.",
      en: "Reference implementation of the spec. Hosts /play (interactive demo), /verify (HMAC verification), /api/play/audit/* (audit endpoints), /test-vectors (conformance vectors). Not a productive company, i.e. does not transact with real customers, does not emit invoices, does not collect. Source of truth for the spec.",
    },
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "mp-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://mp-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure: {
      es: "Demo de integración con Mercado Pago Subscriptions. Conectado a un MP sandbox real + producción app 178743372667921. Muestra la lib @ar-agents/mercadopago end-to-end. No es una sociedad productiva.",
      en: "Mercado Pago Subscriptions integration demo. Wired to a real MP sandbox + production app 178743372667921. Shows the @ar-agents/mercadopago lib end-to-end. Not a productive company.",
    },
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "cuit-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://cuit-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure: {
      es: "Demo de consulta a padrón AFIP/ARCA + validación de CUIT. Usa un cert AFIP real (homo por seguridad; cert prod disponible). Muestra la lib @ar-agents/identity end-to-end. No es una sociedad productiva.",
      en: "AFIP/ARCA padron lookup + CUIT validation demo. Uses a real AFIP cert (homo for safety; prod cert available). Shows the @ar-agents/identity lib end-to-end. Not a productive company.",
    },
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "whatsapp-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://whatsapp-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure: {
      es: "Demo de WhatsApp Business Cloud API combinando libs de identity + MP + WhatsApp. Handler de webhook + UI de chat. Limitado por el cap de 5 destinatarios en dev hasta que pase la verificación de negocio de Meta.",
      en: "WhatsApp Business Cloud API demo combining identity + MP + WhatsApp libs. Webhook handler + chat UI. Limited by Meta verification 5-recipient dev cap until business verification passes.",
    },
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "bridge-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://bridge-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure: {
      es: "Demo de Agentic Commerce Bridge. Superficies AP2 + ACP + MCP conectadas a MP. Muestra cómo un agente extranjero (Wyoming DAO LLC) interactúa con una sociedad automatizada argentina según receta 21 del cookbook.",
      en: "Agentic Commerce Bridge demo. AP2 + ACP + MCP protocol surfaces wired to MP. Shows how a foreign agent (Wyoming DAO LLC) interacts with an AR automated company per cookbook recipe 21.",
    },
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "(your automated company here)",
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "-",
    publicUrl: "-",
    rfcConformance: [],
    disclosure: {
      es: "Abrí un PR agregando los metadatos de tu sociedad automatizada a apps/landing/src/app/registro/page.tsx en github.com/ar-agents/ar-agents. Incluí: nombre, operador + CUIT, URL pública, RFCs conformados, disclosure en lenguaje claro. El PR se revisa por honestidad (ej., si reclamás RFC-001 tu /.well-known/agents.json debe resolver).",
      en: "Open a PR adding your automated company's metadata to apps/landing/src/app/registro/page.tsx in github.com/ar-agents/ar-agents. Provide: name, operator name + CUIT, public URL, RFCs you conform to, plain-English disclosure. The PR will be reviewed for honest claims (e.g. claimed RFC-001 conformance must include a /.well-known/agents.json that resolves).",
    },
    status: "draft",
    listedSince: "-",
  },
];

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
};

const STATUS_LABEL: Record<
  RegistryEntry["status"],
  { es: string; en: string }
> = {
  live: { es: "live", en: "live" },
  draft: { es: "draft", en: "draft" },
  deprecated: { es: "deprecated", en: "deprecated" },
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
});

export async function RegistroContent({ lang }: { lang: Lang }) {
  const histories = await Promise.all(
    REGISTRY.map(async (e) =>
      e.status === "live" && e.publicUrl !== "-"
        ? await fetchHistory(e.publicUrl)
        : [],
    ),
  );
  const historyByName = new Map<string, HistoryPoint[]>();
  REGISTRY.forEach((e, i) => historyByName.set(e.name, histories[i]));

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
                key={entry.name}
                entry={entry}
                history={historyByName.get(entry.name) ?? []}
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
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <Badge
            text={TYPE_LABEL[entry.type][lang]}
            color={TYPE_COLOR[entry.type]}
          />
          <Badge
            text={STATUS_LABEL[entry.status][lang]}
            color={STATUS_COLOR[entry.status]}
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
