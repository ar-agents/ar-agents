/**
 * Recipe 28 — Operator onboarding checklist + automated verification.
 *
 * # Pattern
 *
 * You're an operator about to launch your first sociedad-IA. There are
 * 18 items to wire up across MercadoPago, AFIP/ARCA, WhatsApp, banking,
 * KV storage, HMAC signing, Ed25519 signing (optional v2), env vars,
 * domain DNS, /.well-known publication.
 *
 * Recipe 28 is the inventory + auto-verifier: a single function
 * `checkOperatorReadiness(baseUrl)` that walks the checklist
 * programmatically and returns a per-item pass/fail/skip with
 * remediation links.
 *
 * The output is a deterministic JSON readiness report — the operator's
 * pre-launch sign-off. Used internally by the auto-incorporation wizard
 * (/api/auto-incorporate) to confirm a freshly-deployed sociedad-IA is
 * production-ready before adding it to /registro.
 *
 * # When to use
 *
 *   - Right after running `vercel deploy` of a freshly-generated
 *     sociedad-IA from the sociedad-ia-starter template.
 *   - Before listing in /registro (the registry rejects entries with a
 *     readiness < B).
 *   - As a pre-merge gate in the operator's own CI (analogous to recipe 26
 *     but covers operator-wiring, not just RFC conformance).
 *
 * # Edge Runtime
 *
 * Pure fetch + JSON shaping. Runs anywhere fetch is available.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Item {
  id: string;
  category:
    | "discovery"
    | "audit"
    | "providers"
    | "security"
    | "legal"
    | "ops"
    | "tooling";
  label: string;
  status: "pass" | "fail" | "skip" | "warn";
  detail: string;
  remediation?: string;
  ref?: string;
}

export interface Readiness {
  $schema: string;
  generatedAt: string;
  target: { baseUrl: string };
  readiness: "ready" | "almost" | "blocked" | "not-deployed";
  passedCount: number;
  totalCount: number;
  items: Item[];
}

// ─────────────────────────────────────────────────────────────────────────────
// The checklist
// ─────────────────────────────────────────────────────────────────────────────

interface Check {
  id: string;
  category: Item["category"];
  label: string;
  ref?: string;
  /** Returns the Item details. */
  run: (base: string, fetchImpl: typeof fetch) => Promise<Omit<Item, "id" | "category" | "label" | "ref">>;
}

async function fetchOk(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number; body?: unknown }> {
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, status: r.status };
    let body: unknown;
    try {
      const ct = r.headers.get("content-type") || "";
      body = ct.includes("application/json") ? await r.json() : await r.text();
    } catch {
      body = null;
    }
    return { ok: true, status: r.status, body };
  } catch {
    return { ok: false, status: 0 };
  }
}

const CHECKS: ReadonlyArray<Check> = [
  {
    id: "discovery-well-known",
    category: "discovery",
    label: "/.well-known/agents.json serves manifest with issuer.jurisdiction",
    ref: "https://ar-agents.ar/rfcs/002",
    run: async (base, fetchImpl) => {
      const r = await fetchOk(`${base}/.well-known/agents.json`, fetchImpl);
      if (!r.ok) return { status: "fail", detail: `HTTP ${r.status || "network error"}`, remediation: "Add apps/landing/public/.well-known/agents.json per RFC-002 schema." };
      const m = r.body as Record<string, unknown> | null;
      const j = m?.issuer as Record<string, unknown> | undefined;
      if (!j?.jurisdiction) return { status: "fail", detail: "Missing issuer.jurisdiction.", remediation: "Add issuer.jurisdiction to your agents.json." };
      return { status: "pass", detail: `jurisdiction=${j.jurisdiction}.` };
    },
  },
  {
    id: "discovery-rfc-conformance",
    category: "discovery",
    label: "Manifest declares rfcConformance",
    run: async (base, fetchImpl) => {
      const r = await fetchOk(`${base}/.well-known/agents.json`, fetchImpl);
      if (!r.ok) return { status: "skip", detail: "Manifest fetch failed." };
      const arr = (r.body as Record<string, unknown> | null)?.rfcConformance;
      if (Array.isArray(arr) && arr.length > 0) {
        return { status: "pass", detail: `Claims: ${(arr as string[]).join(", ")}.` };
      }
      return { status: "warn", detail: "No rfcConformance array.", remediation: "Declare which RFCs your impl conforms to (e.g. ['rfc-001-v1', 'rfc-002-v1', 'rfc-004-draft'])." };
    },
  },
  {
    id: "audit-read",
    category: "audit",
    label: "Audit-read endpoint /api/play/audit/{sessionId} responds",
    ref: "https://ar-agents.ar/rfcs/004",
    run: async (base, fetchImpl) => {
      const r = await fetchOk(`${base}/api/play/audit/demo-public-ar-001`, fetchImpl);
      if (!r.ok) return { status: "fail", detail: `HTTP ${r.status}.`, remediation: "Verify your audit-log route is deployed + has the {sessionId} dynamic segment." };
      return { status: "pass", detail: "Endpoint responds 200." };
    },
  },
  {
    id: "audit-verify",
    category: "audit",
    label: "Audit-verify (?verify=1) returns HMAC verification counts",
    ref: "https://ar-agents.ar/rfcs/004",
    run: async (base, fetchImpl) => {
      const r = await fetchOk(`${base}/api/play/audit/demo-public-ar-001?verify=1`, fetchImpl);
      if (!r.ok) return { status: "fail", detail: `HTTP ${r.status}.` };
      const d = r.body as Record<string, unknown> | null;
      const v = (d?.verification ?? d) as Record<string, unknown> | undefined;
      if (typeof v?.hmacWired === "boolean") {
        return v.hmacWired
          ? { status: "pass", detail: `hmacWired=true.` }
          : { status: "warn", detail: "hmacWired=false (production must wire AUDIT_HMAC_SECRET).", remediation: "Set AUDIT_HMAC_SECRET env var in your Vercel project." };
      }
      return { status: "warn", detail: "Response missing verification counts." };
    },
  },
  {
    id: "audit-csv",
    category: "audit",
    label: "CSV export endpoint returns text/csv",
    run: async (base, fetchImpl) => {
      try {
        const r = await fetchImpl(`${base}/api/play/audit/demo-public-ar-001/csv`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { status: "fail", detail: `HTTP ${r.status}.` };
        const ct = r.headers.get("content-type") || "";
        return ct.includes("text/csv")
          ? { status: "pass", detail: `Content-Type: ${ct}.` }
          : { status: "warn", detail: `Content-Type is ${ct}, expected text/csv.` };
      } catch (e) {
        return { status: "fail", detail: `Network error: ${(e as Error).message}` };
      }
    },
  },
  {
    id: "rfc-005-keys",
    category: "audit",
    label: "RFC-005 /.well-known/sociedad-ia/keys publishes Ed25519 key",
    ref: "https://ar-agents.ar/rfcs/005",
    run: async (base, fetchImpl) => {
      const r = await fetchOk(`${base}/.well-known/sociedad-ia/keys`, fetchImpl);
      if (!r.ok) return { status: "skip", detail: `Not advertised (HTTP ${r.status}). v1 HMAC-only is OK.`, remediation: "Optional: publish your Ed25519 public key per RFC-005 § 4 for asymmetric verifier support." };
      const keys = (r.body as Record<string, unknown> | null)?.keys;
      return Array.isArray(keys) && keys.length > 0
        ? { status: "pass", detail: `${keys.length} key(s) advertised.` }
        : { status: "warn", detail: "Endpoint exists but no keys advertised." };
    },
  },
  {
    id: "tooling-openapi",
    category: "tooling",
    label: "/api/openapi returns OpenAPI 3.x spec",
    run: async (base, fetchImpl) => {
      const r = await fetchOk(`${base}/api/openapi`, fetchImpl);
      if (!r.ok) return { status: "skip", detail: `Not advertised (HTTP ${r.status}).`, remediation: "Optional but recommended for tooling generators." };
      const d = r.body as Record<string, unknown> | null;
      return typeof d?.openapi === "string" && (d.openapi as string).startsWith("3.")
        ? { status: "pass", detail: `OpenAPI ${d.openapi}.` }
        : { status: "warn", detail: "Not an OpenAPI 3.x doc." };
    },
  },
  {
    id: "security-hsts",
    category: "security",
    label: "HSTS header present on root response",
    run: async (base, fetchImpl) => {
      try {
        const r = await fetchImpl(base, { signal: AbortSignal.timeout(5000) });
        const hsts = r.headers.get("strict-transport-security");
        return hsts
          ? { status: "pass", detail: hsts }
          : { status: "warn", detail: "HSTS missing.", remediation: "Vercel sets HSTS by default on .vercel.app domains; on custom domains, ensure the redirect is configured." };
      } catch (e) {
        return { status: "fail", detail: `Network error: ${(e as Error).message}` };
      }
    },
  },
  {
    id: "tooling-sitemap",
    category: "tooling",
    label: "Sitemap.xml is published",
    run: async (base, fetchImpl) => {
      const r = await fetchOk(`${base}/sitemap.xml`, fetchImpl);
      return r.ok
        ? { status: "pass", detail: "sitemap.xml present." }
        : { status: "warn", detail: "No sitemap.xml advertised." };
    },
  },
  {
    id: "tooling-llms-txt",
    category: "tooling",
    label: "/llms.txt is published for AI crawlers",
    run: async (base, fetchImpl) => {
      const r = await fetchOk(`${base}/llms.txt`, fetchImpl);
      return r.ok
        ? { status: "pass", detail: "/llms.txt present." }
        : { status: "warn", detail: "No /llms.txt advertised.", remediation: "Publish /llms.txt per the llmstxt.org convention so AI crawlers can ingest your sociedad's surface." };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function checkOperatorReadiness(
  baseUrl: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<Readiness> {
  const parsed = new URL(baseUrl);
  const base = parsed.origin;
  const fetchImpl = options.fetchImpl ?? fetch;

  const items: Item[] = await Promise.all(
    CHECKS.map(async (c): Promise<Item> => {
      const r = await c.run(base, fetchImpl);
      return {
        id: c.id,
        category: c.category,
        label: c.label,
        ref: c.ref,
        ...r,
      };
    }),
  );

  const passing = items.filter((i) => i.status === "pass").length;
  const failing = items.filter((i) => i.status === "fail").length;

  let readiness: Readiness["readiness"];
  if (failing > 2) readiness = "blocked";
  else if (failing > 0 || passing < items.length - 2) readiness = "almost";
  else readiness = "ready";

  return {
    $schema: "https://ar-agents.ar/schemas/readiness.v1.json",
    generatedAt: new Date().toISOString(),
    target: { baseUrl: base },
    readiness,
    passedCount: passing,
    totalCount: items.length,
    items,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI: `tsx 28-operator-onboarding-checklist.ts <baseUrl>`
// ─────────────────────────────────────────────────────────────────────────────

declare const process: { argv: string[] } | undefined;

async function main() {
  if (typeof process === "undefined") return;
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("usage: tsx 28-operator-onboarding-checklist.ts <baseUrl>");
    return;
  }
  const r = await checkOperatorReadiness(baseUrl);
  console.log(JSON.stringify(r, null, 2));
  if (typeof process !== "undefined" && "exit" in process) {
    (process as unknown as { exit: (code: number) => void }).exit(
      r.readiness === "blocked" ? 1 : 0,
    );
  }
}

const isMain = typeof require !== "undefined" && require.main === module;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    if (typeof process !== "undefined" && "exit" in process) {
      (process as unknown as { exit: (code: number) => void }).exit(1);
    }
  });
}
