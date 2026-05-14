"use client";

// Landing for @ar-agents/mercadolibre. Mirrors the structure of
// ar-agents.ar (the umbrella + MP toolkit landing) but specialized
// for Mercado Libre and themed with MELI yellow (#ffe600 in dark mode,
// #b58e00 companion for light-mode accent text).

import { useLang, type Translations } from "./i18n";
import { LiveDemo } from "./live-demo";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const QUICK_START = `pnpm add @ar-agents/mercadolibre ai zod

import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { MeliClient } from "@ar-agents/mercadolibre";
import { meliTools } from "@ar-agents/mercadolibre/ai-sdk";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

const agent = new Agent({
  model: anthropic("claude-sonnet-4-6"),
  tools: meliTools(client, { siteId: "MLA", sellerId: 12345 }),
  stopWhen: stepCountIs(8),
});

const { text } = await agent.generate({
  prompt: "Cuántas órdenes pagas tengo hoy y hay alguna pregunta sin responder?",
});`;

const MCP_CONFIG = `{
  "mcpServers": {
    "ar-agents": {
      "command": "npx",
      "args": ["-y", "@ar-agents/mcp"],
      "env": {
        "MELI_ACCESS_TOKEN": "APP_USR-...",
        "MELI_SELLER_ID": "12345",
        "MELI_SITE_ID": "MLA"
      }
    }
  }
}`;

type Domain = {
  titleKey: keyof Translations;
  descKey: keyof Translations;
  tag: string;
};

const DOMAINS: ReadonlyArray<Domain> = [
  { titleKey: "d_items_t", descKey: "d_items_d", tag: "items" },
  { titleKey: "d_questions_t", descKey: "d_questions_d", tag: "questions" },
  { titleKey: "d_orders_t", descKey: "d_orders_d", tag: "orders" },
  { titleKey: "d_claims_t", descKey: "d_claims_d", tag: "claims" },
  { titleKey: "d_shipments_t", descKey: "d_shipments_d", tag: "shipments" },
  { titleKey: "d_reputation_t", descKey: "d_reputation_d", tag: "reputation" },
  { titleKey: "d_promotions_t", descKey: "d_promotions_d", tag: "promotions" },
  { titleKey: "d_webhooks_t", descKey: "d_webhooks_d", tag: "webhooks" },
  { titleKey: "d_aisdk_t", descKey: "d_aisdk_d", tag: "/ai-sdk" },
];

type Blindspot = {
  titleKey: keyof Translations;
  descKey: keyof Translations;
};

const BLINDSPOTS: ReadonlyArray<Blindspot> = [
  { titleKey: "blind_1_t", descKey: "blind_1_d" },
  { titleKey: "blind_2_t", descKey: "blind_2_d" },
  { titleKey: "blind_3_t", descKey: "blind_3_d" },
  { titleKey: "blind_4_t", descKey: "blind_4_d" },
  { titleKey: "blind_5_t", descKey: "blind_5_d" },
  { titleKey: "blind_6_t", descKey: "blind_6_d" },
  { titleKey: "blind_7_t", descKey: "blind_7_d" },
  { titleKey: "blind_8_t", descKey: "blind_8_d" },
];

type ProdRow = {
  titleKey: keyof Translations;
  descKey: keyof Translations;
};

const PROD_ROWS: ReadonlyArray<ProdRow> = [
  { titleKey: "prod_idem_t", descKey: "prod_idem_d" },
  { titleKey: "prod_telemetry_t", descKey: "prod_telemetry_d" },
  { titleKey: "prod_timeout_t", descKey: "prod_timeout_d" },
  { titleKey: "prod_security_t", descKey: "prod_security_d" },
  { titleKey: "prod_edge_t", descKey: "prod_edge_d" },
  { titleKey: "prod_tests_t", descKey: "prod_tests_d" },
];

type BenchRow = {
  labelKey: keyof Translations;
  valueKey: keyof Translations;
};

const BENCH_ROWS: ReadonlyArray<BenchRow> = [
  { labelKey: "bench_ratelim_t", valueKey: "bench_ratelim_v" },
  { labelKey: "bench_classify_t", valueKey: "bench_classify_v" },
  { labelKey: "bench_pipeline_t", valueKey: "bench_pipeline_v" },
  { labelKey: "bench_size_t", valueKey: "bench_size_v" },
];

export default function Home() {
  const { t, lang } = useLang();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: FONT_SANS,
        color: "var(--text)",
        padding: "80px 24px 120px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* /arg umbrella banner */}
        <section
          aria-label={t.banner_eyebrow}
          style={{
            marginBottom: 32,
            padding: "16px 20px",
            borderRadius: 8,
            background: "var(--bg-tint)",
            boxShadow: "var(--shadow-border)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                fontFamily: FONT_MONO,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "var(--accent-text)",
                fontWeight: 600,
              }}
            >
              {t.banner_eyebrow}
            </span>
            <span
              style={{
                fontSize: 14,
                color: "var(--text-body)",
                lineHeight: 1.5,
              }}
            >
              {t.banner_title}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 13,
              fontFamily: FONT_MONO,
            }}
          >
            <a
              href="https://ar-agents.ar"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              {t.banner_link_umbrella}
            </a>
            <a
              href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              {t.banner_link_github}
            </a>
            <a
              href="https://www.npmjs.com/package/@ar-agents/mercadolibre"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              {t.banner_link_npm}
            </a>
            <a
              href="https://bridge-hello.ar-agents.ar"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              {t.banner_link_demo}
            </a>
            <a
              href="/vs"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              vs
            </a>
            <a
              href="/operated-by"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              operated by
            </a>
            <a
              href="/integrate"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              integrate
            </a>
          </div>
        </section>

        {/* HERO */}
        <header style={{ marginBottom: 48 }}>
          <p
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
              margin: 0,
              fontFamily: FONT_MONO,
              fontWeight: 500,
              fontFeatureSettings: '"liga", "tnum"',
            }}
          >
            {t.hero_eyebrow}
          </p>
          <h1
            style={{
              fontSize: "clamp(38px, 8vw, 50px)",
              margin: "16px 0 20px",
              fontWeight: 600,
              lineHeight: 1.12,
              letterSpacing: "-0.05em",
              color: "var(--text)",
            }}
          >
            {lang === "es" ? (
              <>
                Toolkit de<br className="br-mobile" /> Mercado Libre
                <br className="br-mobile" /> para Agentes.
              </>
            ) : (
              <>
                Mercado Libre<br className="br-mobile" /> Agent Toolkit.
              </>
            )}
            <br />
            <span style={{ color: "var(--text-muted)" }}>{t.hero_h1_l2}</span>
          </h1>
          <p
            style={{
              fontSize: 18,
              lineHeight: 1.55,
              color: "var(--text-body)",
              maxWidth: 720,
              margin: "0 0 28px",
            }}
          >
            {t.hero_sub}
          </p>

          {/* Proof strip */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 28,
            }}
          >
            {[t.proof_tests, t.proof_audit, t.proof_size, t.proof_runtime].map(
              (label) => (
                <span
                  key={label}
                  style={{
                    fontSize: 12,
                    fontFamily: FONT_MONO,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "var(--accent-bg)",
                    color: "var(--accent-text)",
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                  }}
                >
                  {label}
                </span>
              ),
            )}
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <a
              href="https://www.npmjs.com/package/@ar-agents/mercadolibre"
              style={{
                fontFamily: FONT_MONO,
                fontSize: 13,
                background: "var(--accent-strong)",
                color: "var(--accent-strong-text)",
                padding: "12px 18px",
                borderRadius: 8,
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              {t.hero_cta_install} →
            </a>
            <a
              href="https://bridge-hello.ar-agents.ar"
              style={{
                fontFamily: FONT_MONO,
                fontSize: 13,
                background: "var(--bg-tint)",
                color: "var(--text)",
                padding: "12px 18px",
                borderRadius: 8,
                fontWeight: 500,
                letterSpacing: "0.02em",
                boxShadow: "var(--shadow-border)",
              }}
            >
              {t.hero_cta_demo} ↗
            </a>
            <a
              href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre#readme"
              style={{
                fontFamily: FONT_MONO,
                fontSize: 13,
                color: "var(--text-body)",
                padding: "12px 4px",
                fontWeight: 500,
                letterSpacing: "0.02em",
                textDecoration: "underline",
                textUnderlineOffset: 4,
              }}
            >
              {t.hero_cta_docs} ↗
            </a>
          </div>
        </header>

        {/* LIVE DEMO */}
        <section style={{ marginBottom: 56 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              margin: "0 0 8px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {lang === "es" ? "Demo en vivo" : "Live demo"}
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--accent-strong)",
                color: "var(--accent-strong-text)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              LIVE
            </span>
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-body)",
              margin: "0 0 20px",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            {lang === "es"
              ? "Un agente real (claude-sonnet-4-6) corriendo las 14 tools contra un backend mockeado de MELI. Probá las preguntas presets o escribí la tuya."
              : "A real agent (claude-sonnet-4-6) running the 14 tools against a mocked MELI backend. Try a preset prompt or write your own."}
          </p>
          <LiveDemo />
        </section>

        {/* QUICKSTART */}
        <section style={{ marginBottom: 56 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              margin: "0 0 8px",
            }}
          >
            {t.qs_h2}
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-body)",
              margin: "0 0 20px",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            {t.qs_sub}
          </p>
          <pre
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12.5,
              background: "var(--bg-tint)",
              color: "var(--text)",
              padding: "20px 24px",
              borderRadius: 10,
              overflowX: "auto",
              boxShadow: "var(--shadow-border)",
              lineHeight: 1.55,
              whiteSpace: "pre",
            }}
          >
            {QUICK_START}
          </pre>
        </section>

        {/* DOMAINS */}
        <section style={{ marginBottom: 56 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              margin: "0 0 8px",
            }}
          >
            {t.domains_h2}
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-body)",
              margin: "0 0 20px",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            {t.domains_sub}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {DOMAINS.map((d) => (
              <div
                key={d.tag}
                style={{
                  background: "var(--bg-tint)",
                  borderRadius: 10,
                  padding: "16px 18px",
                  boxShadow: "var(--shadow-border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "var(--accent-bg)",
                      color: "var(--accent-text)",
                      letterSpacing: "0.04em",
                      textTransform: "lowercase",
                      fontWeight: 600,
                    }}
                  >
                    {d.tag}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {t[d.titleKey]}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-body)",
                    lineHeight: 1.55,
                    margin: 0,
                  }}
                >
                  {t[d.descKey]}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* BLINDSPOTS */}
        <section style={{ marginBottom: 56 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              margin: "0 0 8px",
            }}
          >
            {t.blind_h2}
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-body)",
              margin: "0 0 20px",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            {t.blind_sub}
          </p>
          <ol
            style={{
              listStyle: "none",
              counterReset: "blind",
              display: "grid",
              gap: 12,
            }}
          >
            {BLINDSPOTS.map((b, i) => (
              <li
                key={b.titleKey}
                style={{
                  background: "var(--bg-tint)",
                  borderRadius: 10,
                  padding: "16px 18px",
                  boxShadow: "var(--shadow-border)",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--accent-strong)",
                    lineHeight: 1,
                    minWidth: 32,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div
                    style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}
                  >
                    {t[b.titleKey]}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-body)",
                      lineHeight: 1.55,
                    }}
                  >
                    {t[b.descKey]}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* PRODUCTION-GRADE */}
        <section style={{ marginBottom: 56 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              margin: "0 0 8px",
            }}
          >
            {t.prod_h2}
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-body)",
              margin: "0 0 20px",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            {t.prod_sub}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {PROD_ROWS.map((row) => (
              <div
                key={row.titleKey}
                style={{
                  background: "var(--bg-tint)",
                  borderRadius: 10,
                  padding: "16px 18px",
                  boxShadow: "var(--shadow-border)",
                }}
              >
                <div
                  style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}
                >
                  {t[row.titleKey]}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-body)",
                    lineHeight: 1.55,
                  }}
                >
                  {t[row.descKey]}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* STRATEGIC v0.4 — HITL + Feed */}
        <section style={{ marginBottom: 56 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              margin: "0 0 8px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {t.strat_h2}
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--accent-strong)",
                color: "var(--accent-strong-text)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              v0.4
            </span>
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-body)",
              margin: "0 0 20px",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            {t.strat_sub}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            <div
              style={{
                background: "var(--bg-tint)",
                borderRadius: 10,
                padding: "20px 22px",
                boxShadow: "var(--shadow-border)",
                borderLeft: "3px solid var(--accent-strong)",
              }}
            >
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--accent-strong)",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                hitl
              </div>
              <div
                style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}
              >
                {t.strat_hitl_t}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-body)",
                  lineHeight: 1.6,
                }}
              >
                {t.strat_hitl_d}
              </div>
            </div>
            <div
              style={{
                background: "var(--bg-tint)",
                borderRadius: 10,
                padding: "20px 22px",
                boxShadow: "var(--shadow-border)",
                borderLeft: "3px solid var(--accent-strong)",
              }}
            >
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--accent-strong)",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                /feed
              </div>
              <div
                style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}
              >
                {t.strat_feed_t}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-body)",
                  lineHeight: 1.6,
                }}
              >
                {t.strat_feed_d}
              </div>
            </div>
          </div>
        </section>

        {/* BENCHMARKS */}
        <section style={{ marginBottom: 56 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              margin: "0 0 8px",
            }}
          >
            {t.bench_h2}
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-body)",
              margin: "0 0 20px",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            {t.bench_sub}
          </p>
          <div
            style={{
              borderRadius: 10,
              overflow: "hidden",
              boxShadow: "var(--shadow-border)",
              background: "var(--bg-tint)",
            }}
          >
            {BENCH_ROWS.map((row, i) => (
              <div
                key={row.labelKey}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border-color)",
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-body)",
                    flex: 1,
                  }}
                >
                  {t[row.labelKey]}
                </span>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--accent-strong)",
                    letterSpacing: "0.02em",
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {t[row.valueKey]}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* MCP */}
        <section style={{ marginBottom: 56 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              margin: "0 0 8px",
            }}
          >
            {t.mcp_h2}
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-body)",
              margin: "0 0 20px",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            {t.mcp_sub}
          </p>
          <pre
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12.5,
              background: "var(--bg-tint)",
              color: "var(--text)",
              padding: "20px 24px",
              borderRadius: 10,
              overflowX: "auto",
              boxShadow: "var(--shadow-border)",
              lineHeight: 1.55,
              whiteSpace: "pre",
            }}
          >
            {MCP_CONFIG}
          </pre>
        </section>

        {/* FOOTER */}
        <footer
          style={{
            marginTop: 80,
            paddingTop: 24,
            borderTop: "1px solid var(--border-color)",
            display: "grid",
            gap: 14,
            fontSize: 12,
            fontFamily: FONT_MONO,
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          <div>
            {t.footer_built}{" "}
            <a
              href="https://github.com/naza00000"
              style={{ color: "var(--accent-text)", textDecoration: "underline" }}
            >
              {t.footer_naza}
            </a>
            . {t.footer_part} {t.footer_license}
          </div>
          <div style={{ maxWidth: 760 }}>{t.footer_unaffiliated}</div>
        </footer>
      </div>
    </main>
  );
}
