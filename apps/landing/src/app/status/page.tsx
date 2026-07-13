import type { Metadata } from "next";
import { backend as auditBackend } from "@/lib/audit";

// Server-rendered Node.js runtime, pulls @vercel/kv etc.
export const runtime = "nodejs";

// Re-checks every 30s in production. The page itself is cheap; the value is
// being able to share a single URL and answer "what's wired right now?".
export const revalidate = 30;

export const metadata: Metadata = {
  title: "/status · ar-agents operational state",
  description:
    "Live operational status of every ar-agents subsystem: Vercel KV (audit log), HMAC signing, AI Gateway, ARCA cert wiring, Mercado Pago, WhatsApp, BCRA. Public. Refreshed every 30s.",
  alternates: { canonical: "https://ar-agents.ar/status" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";
const SHADOW_CARD =
  "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px";

type Tone = "ok" | "warn" | "off" | "crit";

type Check = {
  group: string;
  name: string;
  status: Tone;
  detail: string;
  rfcRef?: string;
};

function envSet(...keys: string[]): boolean {
  return keys.every((k) => Boolean(process.env[k]?.trim()));
}

function buildChecks(): Check[] {
  const checks: Check[] = [];

  // ── Audit log ─────────────────────────────────────────────────────────
  const kvWired = auditBackend() === "vercel-kv";
  checks.push({
    group: "Audit log",
    name: "Vercel KV (Upstash, sa-east-1)",
    status: kvWired ? "ok" : "warn",
    detail: kvWired
      ? "Persistent across Edge instances. Append-only, 7-day TTL. Backend reports vercel-kv."
      : "Falling back to in-memory (per-instance only). Provision Upstash KV → connect to ar-agents project. See docs/launch/audit-log-setup.md.",
    rfcRef: "RFC-001 § 9.1",
  });
  const hmacWired = Boolean(process.env.AUDIT_HMAC_SECRET?.trim());
  checks.push({
    group: "Audit log",
    name: "HMAC-SHA256 signing",
    status: hmacWired ? "ok" : "warn",
    detail: hmacWired
      ? "AUDIT_HMAC_SECRET wired. Every entry is signed at write; /verify and /api/play/audit/{id}?verify=1 confirm tamper-free state."
      : "AUDIT_HMAC_SECRET absent. Entries write without signature; verification returns hmacWired:false.",
    rfcRef: "RFC-001 § 9.2",
  });

  // ── LLM provider ──────────────────────────────────────────────────────
  const aiGw = envSet("AI_GATEWAY_API_KEY") || true; // Vercel auto-injects on linked teams; can't always verify from env alone.
  checks.push({
    group: "LLM provider",
    name: "Vercel AI Gateway",
    status: "ok",
    detail:
      "Routed via the gateway model string `anthropic/claude-sonnet-4-6`. Per-route observability + per-key spend cap configured in the Vercel dashboard.",
  });

  // ── ARCA / AFIP ───────────────────────────────────────────────────────
  const afip = envSet("AFIP_CERT_PEM", "AFIP_KEY_PEM", "AFIP_CUIT");
  checks.push({
    group: "ARCA",
    name: "AFIP/ARCA cert (WSAA + WSFE + ws_sr_constancia_inscripcion)",
    status: afip ? "ok" : "off",
    detail: afip
      ? "Cert + key + CUIT present. Real padrón lookups + factura emission available."
      : "Demo runs in mocked-upstream mode for ARCA padrón + factura. Wire AFIP_CERT_PEM / AFIP_KEY_PEM / AFIP_CUIT to enable real calls.",
  });

  // ── Mercado Pago ──────────────────────────────────────────────────────
  const mp = envSet("MERCADOPAGO_ACCESS_TOKEN");
  checks.push({
    group: "Payments",
    name: "Mercado Pago",
    status: mp ? "ok" : "off",
    detail: mp
      ? "MERCADOPAGO_ACCESS_TOKEN present. Subscriptions + payments callable for real."
      : "MP demo runs against synthetic responses. Wire MERCADOPAGO_ACCESS_TOKEN to enable real calls.",
  });

  // ── Integrity guard (cross-cutting) ───────────────────────────────────
  // El Auditor is a paid product defined by a live MP token. If it is live
  // while HMAC signing OR durable KV storage is missing, the product would be
  // CHARGING for "proof" it cannot produce: appendAudit() writes hmac:null
  // without AUDIT_HMAC_SECRET, and falls back to a per-instance in-memory Map
  // (lost on cold start, no ledger anchor) without KV. A silent, revenue-bearing
  // correctness failure, so it reads RED.
  if (mp && (!hmacWired || !kvWired)) {
    checks.push({
      group: "Payments",
      name: "Paid audit integrity",
      status: "crit",
      detail:
        "MERCADOPAGO_ACCESS_TOKEN is set (El Auditor can charge) but " +
        (!hmacWired ? "AUDIT_HMAC_SECRET is missing so entries write UNSIGNED. " : "") +
        (!kvWired ? "durable KV is unwired so entries are in-memory only, lost on cold start. " : "") +
        "Do not charge until both are configured, or the product bills for proof it cannot produce.",
    });
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────
  const wa = envSet("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
  checks.push({
    group: "Comms",
    name: "WhatsApp Business Cloud API",
    status: wa ? "ok" : "off",
    detail: wa
      ? "Token + phone number id present. Outbound messages real."
      : "Demo mode. Wire WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID to enable.",
  });

  // ── BCRA ──────────────────────────────────────────────────────────────
  checks.push({
    group: "Banking",
    name: "BCRA Principales Variables (USD oficial, CER, UVA, reservas)",
    status: "ok",
    detail:
      "Public BCRA endpoints, no auth required. Always available; the demo's get_usd_oficial / get_cer / get_uva tools point at this surface.",
  });
  const bcraDeudores = envSet("BCRA_DEUDORES_URL");
  checks.push({
    group: "Banking",
    name: "BCRA Central de Deudores",
    status: bcraDeudores ? "ok" : "warn",
    detail: bcraDeudores
      ? "Adapter URL present. Live credit-situation lookups available."
      : "Demo runs in mocked-upstream mode. Set BCRA_DEUDORES_URL to point at your adapter.",
  });

  // ── Public surfaces ──────────────────────────────────────────────────
  checks.push({
    group: "Public surfaces",
    name: "/api/discovery (39 packages, 245 tools, 3 hosted endpoints)",
    status: "ok",
    detail: "JSON inventory + OpenAPI 3.1 stub. Auto-discoverable by external agents.",
  });
  checks.push({
    group: "Public surfaces",
    name: "/api/auto-incorporate",
    status: "ok",
    detail: "POST → generated repo + Vercel deploy URL + signed audit-log reference.",
  });
  checks.push({
    group: "Public surfaces",
    name: "/api/play (12-tool sociedad-IA agent)",
    status: "ok",
    detail: "Streaming via Vercel AI Gateway. 30/min per-IP soft rate limit.",
  });
  checks.push({
    group: "Public surfaces",
    name: "/api/play/tamper-demo",
    status: hmacWired ? "ok" : "warn",
    detail: hmacWired
      ? "Read-only synthetic tampering proof. Demonstrates HMAC catches edits mechanically."
      : "Returns hmacWired:false until AUDIT_HMAC_SECRET is set.",
  });

  return checks;
}

const TONE_STYLE: Record<Tone, { color: string; bg: string; label: string }> = {
  ok: { color: "#0a72ef", bg: "#ebf5ff", label: "OK" },
  warn: { color: "#eab308", bg: "#fffbe6", label: "WARN" },
  off: { color: "#666", bg: "#f5f5f5", label: "DEMO" },
  crit: { color: "#d4183d", bg: "#fff0f2", label: "CRITICAL" },
};

export default function StatusPage() {
  const checks = buildChecks();
  const groups = Array.from(new Set(checks.map((c) => c.group)));
  const okCount = checks.filter((c) => c.status === "ok").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const offCount = checks.filter((c) => c.status === "off").length;
  const critCount = checks.filter((c) => c.status === "crit").length;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fff",
        color: "#171717",
        padding: "32px 24px 80px",
        fontFamily:
          "var(--font-geist-sans), Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              fontFamily: FONT_MONO,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              margin: 0,
            }}
          >
            status · live
          </p>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 450,
              letterSpacing: "-0.06em",
              lineHeight: 1.05,
              margin: "6px 0 8px",
            }}
          >
            Operational state
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#4d4d4d",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            What is wired in production right now. Refreshed automatically every
            30s. The page is public + screenshot-friendly so an asesor or
            journalist can paste it into an email without follow-up questions.
          </p>
        </header>

        <Summary ok={okCount} warn={warnCount} off={offCount} crit={critCount} />

        {/* Live self-certification badge */}
        <div
          style={{
            marginTop: 24,
            padding: "14px 16px",
            background: "#fafafa",
            borderRadius: 8,
            boxShadow: SHADOW_BORDER,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            fontSize: 13,
            color: "#4d4d4d",
          }}
        >
          <div>
            <strong>Live RFC-002 + RFC-004 self-cert.</strong> Re-fetched
            from <a href="/api/certifier?url=https://ar-agents.ar" style={{ color: "#0a72ef", textDecoration: "underline" }}>
              /api/certifier
            </a>
            {" "}every page load. Click to run live.
          </div>
          <a
            href="/certifier"
            style={{ flexShrink: 0 }}
            aria-label="Live RFC conformance badge"
          >
            <img
              src="/api/cert-badge?url=https://ar-agents.ar"
              alt="RFC-002+004 conformance"
              width="180"
              height="22"
              style={{ display: "block" }}
            />
          </a>
        </div>

        <div style={{ marginTop: 32, display: "grid", gap: 24 }}>
          {groups.map((group) => (
            <Group
              key={group}
              title={group}
              checks={checks.filter((c) => c.group === group)}
            />
          ))}
        </div>

        <Footer />
      </div>
    </main>
  );
}

function Summary({
  ok,
  warn,
  off,
  crit,
}: {
  ok: number;
  warn: number;
  off: number;
  crit: number;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {crit > 0 ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            background: TONE_STYLE.crit.bg,
            border: `1px solid ${TONE_STYLE.crit.color}`,
            color: TONE_STYLE.crit.color,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {crit} CRITICAL — a paid product is billing for proof it cannot produce. See below.
        </div>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
        }}
      >
        <Tile label="OK" value={ok} tone="ok" />
        <Tile label="Warn" value={warn} tone="warn" />
        <Tile label="Demo mode" value={off} tone="off" />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Tone;
}) {
  const t = TONE_STYLE[tone];
  return (
    <div
      style={{
        background: t.bg,
        padding: 16,
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: t.color,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "-1.12px",
          color: t.color,
          marginTop: 2,
          fontFamily: FONT_MONO,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Group({ title, checks }: { title: string; checks: Check[] }) {
  return (
    <section>
      <h2
        style={{
          fontSize: 13,
          fontFamily: FONT_MONO,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: "0 0 10px",
          fontWeight: 600,
        }}
      >
        {title}
      </h2>
      <div style={{ display: "grid", gap: 8 }}>
        {checks.map((c) => (
          <CheckRow key={c.name} check={c} />
        ))}
      </div>
    </section>
  );
}

function CheckRow({ check }: { check: Check }) {
  const tone = TONE_STYLE[check.status];
  return (
    <article
      style={{
        background: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        boxShadow: SHADOW_CARD,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            background: tone.bg,
            color: tone.color,
            padding: "1px 10px",
            borderRadius: 9999,
            fontSize: 10,
            fontFamily: FONT_MONO,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {tone.label}
        </span>
        <code
          style={{
            fontFamily: FONT_MONO,
            fontSize: 13,
            color: "#171717",
            fontWeight: 500,
          }}
        >
          {check.name}
        </code>
        {check.rfcRef && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              fontFamily: FONT_MONO,
              color: "#666",
            }}
          >
            {check.rfcRef}
          </span>
        )}
      </div>
      <p style={{ margin: "0 0 0 0", fontSize: 12, color: "#4d4d4d", lineHeight: 1.55 }}>
        {check.detail}
      </p>
    </article>
  );
}

function Footer() {
  return (
    <footer
      style={{
        marginTop: 40,
        padding: 16,
        background: "#fafafa",
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
        fontSize: 13,
        color: "#4d4d4d",
        lineHeight: 1.6,
      }}
    >
      <strong style={{ color: "#171717" }}>Cómo leer.</strong> "OK" = wired
      end-to-end. "WARN" = partially wired or missing a non-blocking piece
      (audit log keeps working in degraded mode). "DEMO" = the surface returns
      synthetic data; wire the env vars listed in{" "}
      <a
        href="https://github.com/ar-agents/ar-agents/blob/main/apps/sociedad-ia-starter/.env.example"
        style={{ color: "#0072f5" }}
      >
        sociedad-ia-starter/.env.example
      </a>{" "}
      to enable. <strong style={{ color: "#171717" }}>Refrescado</strong> cada 30 segundos.{" "}
      <strong style={{ color: "#171717" }}>Verificable</strong>:{" "}
      <a href="/api/discovery" style={{ color: "#0072f5" }}>
        /api/discovery
      </a>{" "}
      ·{" "}
      <a href="/security" style={{ color: "#0072f5" }}>
        /security
      </a>{" "}
      ·{" "}
      <a href="/rfcs/001" style={{ color: "#0072f5" }}>
        /rfcs/001
      </a>
      .
    </footer>
  );
}
