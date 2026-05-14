import type { Metadata } from "next";
import Link from "next/link";
import { VsTable } from "./vs-table";

export const metadata: Metadata = {
  title: "@ar-agents/mercadolibre vs alternatives",
  description:
    "Honest comparison of @ar-agents/mercadolibre vs the archived official mercadolibre/nodejs-sdk and a naive fetch implementation.",
};

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";

export default function VsPage() {
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
        <Link
          href="/"
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            textDecoration: "underline",
            textUnderlineOffset: 4,
          }}
        >
          ← back to landing
        </Link>

        <header style={{ margin: "32px 0 28px" }}>
          <h1
            style={{
              fontSize: "clamp(34px, 7vw, 44px)",
              margin: 0,
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: "-0.04em",
            }}
          >
            @ar-agents/mercadolibre vs alternatives
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: "var(--text-body)",
              maxWidth: 720,
              margin: "16px 0 0",
            }}
          >
            What you get when you reach for an SDK to talk to MELI from your
            agent. Honest comparison — no straw men. We linked every claim
            below to the source so you can verify.
          </p>
        </header>

        <VsTable />

        <section style={{ marginTop: 56 }}>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              margin: "0 0 12px",
            }}
          >
            Why the official SDK isn&rsquo;t coming back
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--text-body)",
              maxWidth: 720,
              margin: "0 0 12px",
            }}
          >
            The{" "}
            <a
              href="https://github.com/mercadolibre/nodejs-sdk"
              style={{
                color: "var(--accent-text)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              mercadolibre/nodejs-sdk
            </a>{" "}
            repository was archived on Feb&nbsp;14,&nbsp;2022. The README
            redirects to{" "}
            <a
              href="https://developers.mercadolibre.com.ar/"
              style={{
                color: "var(--accent-text)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              developers.mercadolibre.com.ar
            </a>{" "}
            — i.e., &ldquo;here are the docs, build it yourself.&rdquo; The
            ecosystem since 2022 has converged on a few unmaintained forks +
            a lot of bespoke <code>fetch</code> wrappers, none of which
            handle the production gotchas the archived SDK glossed over
            either (single-use refresh-token races, rate-limit per seller,
            <code>/myfeeds</code> replay, claim 2-day SLA defense, etc.).
          </p>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--text-body)",
              maxWidth: 720,
              margin: "0",
            }}
          >
            <code>@ar-agents/mercadolibre</code> rebuilds the typed surface
            from scratch as production-grade infrastructure for the AI SDK
            era. Drop-in for{" "}
            <code>Experimental_Agent</code> from{" "}
            <a
              href="https://ai-sdk.dev"
              style={{
                color: "var(--accent-text)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Vercel AI SDK 6
            </a>
            ; deploy to any V8 isolate (Vercel Edge, Cloudflare Workers,
            Deno).
          </p>
        </section>

        <section style={{ marginTop: 56 }}>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              margin: "0 0 12px",
            }}
          >
            What an honest naive-<code>fetch</code> implementation looks like
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--text-body)",
              maxWidth: 720,
              margin: "0 0 16px",
            }}
          >
            Most teams start with a hand-rolled <code>fetch</code> wrapper.
            That gets you 80% of the surface in a weekend. The remaining 20%
            is what shows up under load — and what makes a CTO wince at the
            on-call ticket. Below is what each block looks like in
            <code> @ar-agents/mercadolibre</code> vs the equivalent
            hand-rolled cost.
          </p>
          <ul
            style={{
              listStyle: "none",
              display: "grid",
              gap: 12,
              margin: 0,
              padding: 0,
            }}
          >
            <CostRow
              feature="Single-use refresh-token coalescing"
              naive="Per-process mutex (~100 LOC) + database compare-and-swap predicate (~80 LOC) + tests for the race window (~60 LOC). Most teams skip the CAS and lose 5–10% of refreshes silently."
            />
            <CostRow
              feature="Per-seller token-bucket rate limit with idle GC"
              naive="In-memory bucket with refill math (~80 LOC) + idle eviction sweep (~30 LOC). 90% of fetch wrappers hardcode setTimeout-style throttling, which doesn't isolate tenants."
            />
            <CostRow
              feature="/myfeeds 2-day replay + dedup"
              naive="Pagination loop with offset (~40 LOC) + dedup table keyed by (topic, resource, sent) (~30 LOC) + KV/DB integration. Almost nobody ships this."
            />
            <CostRow
              feature="Idempotent-only retry classifier"
              naive="Default retry loops on 5xx for any verb. POST/PUT split-brain hits production a few times per quarter and is debugged via Slack screenshots — never via the SDK."
            />
            <CostRow
              feature="Claim defense with sequential evidence + partial-failure surface"
              naive="Promise.all races MELI's one-shot semantics. The first time you defend a claim with 3 evidences and one fails, the seller is half-defended and you're out of recourse."
            />
            <CostRow
              feature="14 typed Vercel AI SDK 6 tools"
              naive="Hand-write Zod schemas for every endpoint (~600 LOC) + tool description copy that the LLM uses to decide WHEN to call (~14 paragraphs). Easy to do badly; hard to do well."
            />
          </ul>
        </section>

        <p
          style={{
            marginTop: 64,
            fontSize: 13,
            color: "var(--text-muted)",
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          }}
        >
          Source for every claim →{" "}
          <a
            href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre"
            style={{
              color: "var(--accent-text)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            github.com/ar-agents/ar-agents
          </a>
        </p>
      </div>
    </main>
  );
}

function CostRow({ feature, naive }: { feature: string; naive: string }) {
  return (
    <li
      style={{
        background: "var(--bg-tint)",
        borderRadius: 10,
        padding: "16px 18px",
        boxShadow: "var(--shadow-border)",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
        {feature}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-body)",
          lineHeight: 1.55,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          naïve fetch:
        </span>{" "}
        {naive}
      </div>
    </li>
  );
}
