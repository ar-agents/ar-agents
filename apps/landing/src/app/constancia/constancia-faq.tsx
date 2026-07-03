/**
 * Server-rendered FAQ section for the Constancia Oracle hub. Pure presentation,
 * no client JS. Copy lives in `page.tsx` so the visible list and the FAQPage
 * JSON-LD (`ConstanciaHubJsonLd`) share one source of truth.
 *
 * House style: Geist + CSS-var theme, minimal, matches constancia-landing.tsx.
 */

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

export function ConstanciaFaq({
  items,
}: {
  items: ReadonlyArray<{ q: string; a: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="constancia-faq-title"
      style={{ maxWidth: 720, margin: "0 auto", padding: "8px 24px 88px" }}
    >
      <p
        id="constancia-faq-title"
        style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 18px",
        }}
      >
        Preguntas frecuentes
      </p>
      <dl style={{ margin: 0 }}>
        {items.map((item) => (
          <div
            key={item.q}
            style={{
              borderTop: "1px solid var(--border-color)",
              padding: "18px 0",
            }}
          >
            <dt
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              {item.q}
            </dt>
            <dd
              style={{
                margin: "8px 0 0",
                fontSize: 15,
                lineHeight: 1.55,
                color: "var(--text-body)",
              }}
            >
              {item.a}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
