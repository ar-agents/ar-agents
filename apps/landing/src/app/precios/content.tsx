import { DocBlock, DocH2, DocP, DocShell } from "../doc-shell";

/**
 * Shared bilingual content for /precios (ES default) and /en/pricing (EN).
 * Server component. Receives `lang` and renders the matching column of T.
 *
 * Commercial model (v3, 2026-07-09): platform-metered, sourced from
 * docs/NORTH-STAR.md § Pricing. Creating, deploying, and operating a
 * Sociedad Automatizada is free with no time limit. Once it is operational
 * and earning, we charge 5x the AI Gateway cost of the tokens its agents
 * consume. That is our only real cost, so it is the only thing we meter.
 * No subscriptions, no seats, no fixed fees.
 *
 * Honest note (ROADMAP.md): M0-6 (billing math: usage rollup + 5x price
 * shown in the dashboard) is done. M2-1 (actually charging via Mercado
 * Pago) is status: blocked (money movement, owner decision). So today
 * every operational society, even ones already earning, runs free; the
 * 5x number is shown as a reference, not yet billed.
 *
 * El Auditor (the signed, hosted audit log, art. 102 defense) is a
 * separate product with its own pricing, out of scope for this page.
 * It is designed to be purchased autonomously by an agent via
 * /api/auditor/subscribe (see /api/discovery), not sold to a human here.
 */

type Lang = "es" | "en";

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const T = {
  eyebrow: { es: "precios", en: "pricing" },
  title: {
    es: "Gratis hasta que tu sociedad factura.",
    en: "Free until your company earns.",
  },
  subtitle: {
    es: "Crear, deployar y operar tu sociedad automatizada no cuesta nada. Medimos los tokens que consumen sus agentes y no cobramos nada hasta que la sociedad empieza a facturar. A partir de ahí cobramos 5x el costo de esos tokens. Sin suscripciones, sin asientos, sin cargos fijos.",
    en: "Creating, deploying, and operating your automated company costs nothing. We meter the tokens its agents consume and charge nothing until the company starts earning. From there we charge 5x the cost of those tokens. No subscriptions, no seats, no fixed fees.",
  },
  h2model: { es: "Cómo funciona", en: "How it works" },
  modelP: {
    es: (
      <>
        Generás tu sociedad desde un prompt, la deployás y la operás gratis,
        sin límite de tiempo. Mientras no factura, corre en modelos gratis o
        de bajo costo con un tope por cuenta. El día que le cobra a un
        cliente real por primera vez, pasa a modo operacional: usa los
        modelos que su trabajo necesite, y cobramos 5x el costo de gateway
        de esos tokens. Es nuestro único costo real, así que es la única
        métrica que usamos.
      </>
    ),
    en: (
      <>
        You generate your company from a prompt, deploy it, and operate it
        for free, with no time limit. While it is not earning, it runs on
        free or low-cost models with a per-account cap. The day it charges a
        real customer for the first time, it moves to operational mode: it
        uses whatever models its work needs, and we charge 5x the gateway
        cost of those tokens. That is our only real cost, so it is the only
        thing we meter.
      </>
    ),
  },
  h2example: { es: "El ejemplo", en: "The example" },
  exampleP1: {
    es: "Tu sociedad ya está operando y factura. Ese mes sus agentes consumen USD 40 en tokens: leen facturas, responden WhatsApp, corren el loop de aprobaciones.",
    en: "Your company is already operating and earning. That month its agents consume USD 40 in tokens: reading invoices, answering WhatsApp, running the approval loop.",
  },
  exampleBlock: {
    es: "tokens del mes    USD 40\nmultiplicador        x 5\n---------------------------\ntu cargo          USD 200",
    en: "tokens this month   USD 40\nmultiplier            x 5\n----------------------------\nyour charge         USD 200",
  },
  exampleP2: {
    es: "Ese cargo es la única línea de tu factura. Antes de facturar, esos mismos USD 40 en tokens no te cuestan nada: corren en el tier gratuito.",
    en: "That charge is the only line on your bill. Before it earns, that same USD 40 in tokens costs nothing: it runs on the free tier.",
  },
  h2free: { es: "Siempre gratis", en: "Always free" },
  freeP: {
    es: "Esto no cambia nunca, factures o no:",
    en: "This never changes, whether you earn or not:",
  },
  freeItems: {
    es: [
      "Los 39 paquetes @ar-agents/* en npm, MIT.",
      "El starter, self-hosteable: corré tu propia sociedad sin pagarnos nada.",
      "El registro público y sus APIs (/api/registry, /api/registry/good-standing).",
    ],
    en: [
      "The 39 @ar-agents/* packages on npm, MIT.",
      "The starter, self-hostable: run your own company without paying us anything.",
      "The public registry and its APIs (/api/registry, /api/registry/good-standing).",
    ],
  },
  h2honest: { es: "Estado real", en: "Honest status" },
  honestP: {
    es: (
      <>
        El cobro todavía no está activo. Ya calculamos el 5x y lo mostramos
        en tu dashboard como referencia, cuánto pagarías si estuviera
        prendido, pero todavía no ejecutamos ningún cargo. Mientras tanto,
        toda sociedad opera gratis, incluso las que ya facturan. Vamos a
        avisar acá el día que se prenda.
      </>
    ),
    en: (
      <>
        Billing is not active yet. We already compute the 5x and show it in
        your dashboard as a reference, how much you would pay if it were on,
        but we do not execute any charge yet. Until then every company
        operates free, even the ones already earning. We will post here the
        day it turns on.
      </>
    ),
  },
  h2faq: { es: "Preguntas", en: "FAQ" },
} as const;

type FaqItem = { q: { es: string; en: string }; a: { es: React.ReactNode; en: React.ReactNode } };

const FAQ: ReadonlyArray<FaqItem> = [
  {
    q: {
      es: "¿Cuándo empieza a cobrarse?",
      en: "When does billing start?",
    },
    a: {
      es: "El día que tu sociedad le cobra por primera vez a un cliente real. Antes de eso, generar, deployar y operar es gratis, sin límite de tiempo.",
      en: "The day your company first charges a real customer. Before that, generating, deploying, and operating is free, with no time limit.",
    },
  },
  {
    q: {
      es: "¿Qué cuenta como facturar?",
      en: "What counts as earning?",
    },
    a: {
      es: "Un cobro real a un tercero: una venta, un servicio, una suscripción. Transacciones de prueba o simuladas no cuentan.",
      en: "A real charge to a third party: a sale, a service, a subscription. Test or simulated transactions do not count.",
    },
  },
  {
    q: {
      es: "¿Puedo usar mi propia clave de modelo?",
      en: "Can I use my own model key?",
    },
    a: {
      es: "Sí. Si conectás tu propia clave (Anthropic, OpenAI, etc.) desde el panel de credenciales de studio, esos tokens no pasan por nuestro AI Gateway, así que no entran en el cálculo del 5x. Pagás directo a tu proveedor.",
      en: "Yes. If you connect your own key (Anthropic, OpenAI, etc.) from studio's credentials panel, those tokens never pass through our AI Gateway, so they do not enter the 5x calculation. You pay your provider directly.",
    },
  },
  {
    q: {
      es: "¿El Auditor tiene otro precio?",
      en: "Does The Auditor have separate pricing?",
    },
    a: {
      es: (
        <>
          Sí. El Auditor es un producto aparte: un audit log firmado y
          hosteado que tu propia sociedad puede contratar sola, por API,
          para cumplir el art. 102. Tiene su propio pricing, fuera de este
          modelo. Más en{" "}
          <a href="/auditor" style={linkSty}>
            /auditor
          </a>
          .
        </>
      ),
      en: (
        <>
          Yes. The Auditor is a separate product: a signed, hosted audit log
          your own company can contract by itself, via API, to satisfy art.
          102. It has its own pricing, outside this model. More at{" "}
          <a href="/auditor" style={linkSty}>
            /auditor
          </a>
          .
        </>
      ),
    },
  },
];

export function PreciosContent({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  return (
    <DocShell
      eyebrow={t("eyebrow") as string}
      title={t("title") as string}
      subtitle={t("subtitle") as string}
    >
      <DocH2>{t("h2model")}</DocH2>
      <DocP>{t("modelP")}</DocP>

      <DocH2>{t("h2example")}</DocH2>
      <DocP>{t("exampleP1")}</DocP>
      <DocBlock>{T.exampleBlock[lang]}</DocBlock>
      <DocP>{t("exampleP2")}</DocP>

      <DocH2>{t("h2free")}</DocH2>
      <DocP>{t("freeP")}</DocP>
      <ul style={{ margin: "0 0 16px", paddingLeft: 20, color: "var(--text-body)" }}>
        {T.freeItems[lang].map((item) => (
          <li key={item} style={{ margin: "0 0 6px" }}>
            {item}
          </li>
        ))}
      </ul>

      <DocH2>{t("h2honest")}</DocH2>
      <DocP>{t("honestP")}</DocP>

      <DocH2>{t("h2faq")}</DocH2>
      {FAQ.map((item) => (
        <div key={item.q.es} style={{ margin: "0 0 20px" }}>
          <p
            style={{
              margin: "0 0 6px",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {item.q[lang]}
          </p>
          <DocP>{item.a[lang]}</DocP>
        </div>
      ))}
    </DocShell>
  );
}
