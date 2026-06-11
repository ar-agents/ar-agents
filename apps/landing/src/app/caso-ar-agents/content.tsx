import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

/**
 * Shared bilingual content for /caso-ar-agents (ES) and /en/ar-agents-case (EN).
 * The recursive proof-of-thesis: ar-agents ran ITSELF through its own pipeline
 * (/incorporar + El Auditor), producing a real, signed, verifiable audit trail.
 * Artifacts captured from a real run on 2026-06-09; live + re-verifiable at
 * /dashboard/ar-agents-sociedad-automatizada.
 */

type Lang = "es" | "en";

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const DASHBOARD = "https://ar-agents.ar/dashboard/ar-agents-sociedad-automatizada";

const AUDIT_SNAPSHOT = `// /dashboard/ar-agents-sociedad-automatizada · snapshot 2026-06-09
// verificación: 2/2 firmadas (HMAC-SHA256 + Ed25519), 0 alteradas

2026-06-09T14:41:54Z  auto_incorporate     ✓ hmac  ✓ ed25519
  → "ar-agents Automatizada" · Sociedad Automatizada (art. 14)
  → objeto: infraestructura para que agentes de IA constituyan
    y operen sociedades automatizadas en Argentina

2026-06-09T14:42:43Z  auditor_subscribe    ✓ hmac  ✓ ed25519
  → El Auditor Pro · USD 199/mes · proof-of-autonomy (art. 102)

→ verificable en vivo, por cualquiera, sin pedirnos la clave (RFC-005).`;

const T = {
  eyebrow: { es: "caso · ar-agents", en: "case · ar-agents" },
  title: {
    es: "Nos constituimos a nosotros mismos.",
    en: "We incorporated ourselves.",
  },
  subtitle: {
    es: "ar-agents es una Sociedad Automatizada que fabrica Sociedades Automatizadas. Para probarlo, nos corrimos por nuestro propio pipeline: nos constituimos, nos suscribimos a nuestro Auditor, y dejamos todo firmado y verificable por cualquiera.",
    en: "ar-agents is an automated company that builds automated companies. To prove it, we ran ourselves through our own pipeline: we incorporated, subscribed to our own Auditor, and left everything signed and verifiable by anyone.",
  },
  h2tesis: { es: "La tesis, en una línea", en: "The thesis, in one line" },
  tesisP: {
    es: (
      <>
        Si Argentina va a alojar empresas operadas por agentes de IA, alguien
        tiene que construir la capa que las constituye y las opera. Nosotros la
        construimos, y la prueba más honesta de que funciona es{" "}
        <strong>usarla con nosotros mismos</strong>. ar-agents es el caso #1 de
        su propio producto.
      </>
    ),
    en: (
      <>
        If Argentina is going to host companies run by AI agents, someone has to
        build the layer that incorporates and operates them. We built it, and
        the most honest proof that it works is{" "}
        <strong>using it on ourselves</strong>. ar-agents is its own product's
        case #1.
      </>
    ),
  },
  h2const: { es: "Paso 1: La constitución", en: "Step 1: Incorporation" },
  constP: {
    es: (
      <>
        Nos pasamos por{" "}
        <a href="/incorporar" style={linkSty}>
          /incorporar
        </a>
        : denominación <DocCode>ar-agents Automatizada</DocCode>, tipo Sociedad
        Automatizada (art. 14), objeto = infraestructura para sociedades de IA.
        El wizard generó el kit real (4 archivos: <DocCode>package.json</DocCode>,{" "}
        <DocCode>lib/agent.ts</DocCode>, <DocCode>.env.example</DocCode>,{" "}
        <DocCode>README.md</DocCode>), corrió el pre-flight de IGJ y firmó la
        primera entrada de auditoría. El propio sistema marcó una{" "}
        <strong>limitación honesta</strong>: el régimen todavía no está
        sancionado (estimado H1 2027). Así que esto es la implementación de
        referencia y un demo vivo, no una inscripción real todavía.
      </>
    ),
    en: (
      <>
        We ran ourselves through{" "}
        <a href="/incorporar" style={linkSty}>
          /incorporar
        </a>
        : name <DocCode>ar-agents Automatizada</DocCode>, type Automated Company
        (art. 14), purpose = infrastructure for AI corporations. The wizard
        generated the real kit (4 files: <DocCode>package.json</DocCode>,{" "}
        <DocCode>lib/agent.ts</DocCode>, <DocCode>.env.example</DocCode>,{" "}
        <DocCode>README.md</DocCode>), ran the IGJ pre-flight, and signed the
        first audit entry. The system itself flagged an{" "}
        <strong>honest limitation</strong>: the regime isn't enacted yet (est.
        H1 2027). So this is the reference implementation and a live demo, not a
        real registration yet.
      </>
    ),
  },
  h2oper: { es: "Paso 2: La operación", en: "Step 2: Operation" },
  operP: {
    es: (
      <>
        Después nos suscribimos a nuestro propio{" "}
        <a href="/precios" style={linkSty}>
          El Auditor
        </a>, por API, operada por agentes. El art. 102 deja al administrador
        responsable por lo que hace la IA. El Auditor es la prueba firmada de que
        operó con un procedimiento adecuado. Una empresa que vende auditoría de
        autonomía, auditándose a sí misma.
      </>
    ),
    en: (
      <>
        Then we subscribed to our own{" "}
        <a href="/en/pricing" style={linkSty}>
          The Auditor
        </a>, over the API, operated by agents. Art. 102 leaves the
        administrator liable for what the AI does. The Auditor is the signed
        proof that it operated through an adequate procedure. A company that
        sells autonomy auditing, auditing itself.
      </>
    ),
  },
  h2prueba: { es: "Paso 3: La prueba (firmada y verificable)", en: "Step 3: The proof (signed & verifiable)" },
  pruebaP: {
    es: (
      <>
        Las dos operaciones quedaron en un log append-only, firmadas con
        HMAC-SHA256 + Ed25519. No te pedimos que nos creas:{" "}
        <a href={DASHBOARD} style={linkSty}>
          verificalo vos mismo
        </a>. El regulador, un periodista o un competidor pueden confirmar que el log
        no fue alterado, sin nuestra clave (RFC-005).
      </>
    ),
    en: (
      <>
        Both operations landed in an append-only log, signed with HMAC-SHA256 +
        Ed25519. Don't take our word for it:{" "}
        <a href={DASHBOARD} style={linkSty}>
          verify it yourself
        </a>. A regulator, a journalist, or a competitor can confirm the log wasn't
        tampered with, without our key (RFC-005).
      </>
    ),
  },
  h2humano: { es: "El rol humano (lo que la ley sí exige)", en: "The human role (what the law does require)" },
  humanoP: {
    es: (
      <>
        Honestidad legal: el régimen no permite cero humanos. La{" "}
        <em>operación</em> es 100% autónoma (art. 14, sin empleados), pero toda
        sociedad conserva un administrador / representante de registro (arts. 88
        y 260). El de ar-agents es{" "}
        <strong>Nazareno Clemente</strong>, autor, no operador. Ese rol mínimo
        es, además, uno de los servicios que ar-agents vende. La empresa-agente
        opera sola; nosotros somos el ancla humana que la ley pide.
      </>
    ),
    en: (
      <>
        Legal honesty: the regime doesn't allow zero humans. The{" "}
        <em>operation</em> is 100% autonomous (art. 14, no employees), but every
        company keeps an administrator / legal representative of record (arts. 88
        and 260). ar-agents' is <strong>Nazareno Clemente</strong>, author, not
        operator. That minimal role is also one of the services ar-agents sells.
        The agent-company runs itself; we are the human anchor the law requires.
      </>
    ),
  },
  h2limits: { es: "Limitaciones honestas", en: "Honest limitations" },
  limitsP: {
    es: "El régimen de sociedades automatizadas todavía no es ley (anteproyecto en el Senado, vigencia estimada a 180 días de publicarse, ~H1 2027). Esto es una implementación de referencia y un demo verificable, no una empresa inscripta. El día que la ley salga, el mismo flujo inscribe de verdad. El audit log vive 7 días en cache. El snapshot de arriba es permanente y el flujo es re-ejecutable.",
    en: "The automated-company regime isn't law yet (draft bill in the Senate, taking effect ~180 days after publication, ~H1 2027). This is a reference implementation and a verifiable demo, not a registered company. The day the law passes, the same flow registers for real. The audit log lives 7 days in cache. The snapshot above is permanent and the flow is re-runnable.",
  },
} as const;

export function CasoArAgentsContent({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  return (
    <DocShell
      eyebrow={t("eyebrow") as string}
      title={t("title") as string}
      subtitle={t("subtitle") as string}
    >
      <DocH2>{t("h2tesis")}</DocH2>
      <DocP>{t("tesisP")}</DocP>

      <DocH2>{t("h2const")}</DocH2>
      <DocP>{t("constP")}</DocP>

      <DocH2>{t("h2oper")}</DocH2>
      <DocP>{t("operP")}</DocP>

      <DocH2>{t("h2prueba")}</DocH2>
      <DocP>{t("pruebaP")}</DocP>
      <DocBlock>{AUDIT_SNAPSHOT}</DocBlock>
      <p style={{ margin: "0 0 24px" }}>
        <a
          href={DASHBOARD}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "var(--bg)",
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          {lang === "es" ? "Verificar el audit log en vivo →" : "Verify the live audit log →"}
        </a>
      </p>

      <DocH2>{t("h2humano")}</DocH2>
      <DocP>{t("humanoP")}</DocP>

      <DocH2>{t("h2limits")}</DocH2>
      <DocP>{t("limitsP")}</DocP>
    </DocShell>
  );
}
