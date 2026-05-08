/**
 * `mercadopago doctor` — diagnostic command for the @ar-agents/mercadopago
 * package. Prints a status report covering:
 *
 *   - Node version
 *   - MP_ACCESS_TOKEN presence + format + sandbox/prod prefix
 *   - Live token validation against `GET /users/me` (lightweight, free)
 *   - Peer-dependency presence (ai, zod, @vercel/kv, @opentelemetry/api)
 *   - Tools registered (count + categories from tools.manifest.json)
 *   - Subpath availability (/vercel-kv, /otel, /testing)
 *
 * No third-party CLI deps. ANSI colors are inlined.
 *
 * Run with:
 *   pnpm exec mercadopago doctor
 *   npx @ar-agents/mercadopago doctor
 *   npx -p @ar-agents/mercadopago mercadopago doctor
 */

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const NO_COLOR = process.env.NO_COLOR != null || !process.stdout.isTTY;
const c = (color: keyof typeof C, s: string) =>
  NO_COLOR ? s : `${C[color]}${s}${C.reset}`;

type CheckResult =
  | { kind: "ok"; line: string; detail?: string }
  | { kind: "warn"; line: string; detail?: string }
  | { kind: "fail"; line: string; detail?: string };

function fmt(r: CheckResult): string {
  const icon =
    r.kind === "ok" ? c("green", "✓") : r.kind === "warn" ? c("yellow", "⚠") : c("red", "✗");
  const detail = r.detail ? `\n  ${c("dim", "→ " + r.detail)}` : "";
  return `${icon} ${r.line}${detail}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────────────────────────────────────

function checkNode(): CheckResult {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) {
    return {
      kind: "ok",
      line: `Node ${process.versions.node} (>= 20.0.0)`,
    };
  }
  return {
    kind: "fail",
    line: `Node ${process.versions.node} too old`,
    detail: `@ar-agents/mercadopago requires Node 20+. Bun and Edge Runtime are also supported.`,
  };
}

function checkAccessToken(): CheckResult {
  const t = process.env.MP_ACCESS_TOKEN?.trim();
  if (!t) {
    return {
      kind: "fail",
      line: "MP_ACCESS_TOKEN not set",
      detail:
        "Get one at https://www.mercadopago.com.ar/developers/panel/app — TEST- prefix for sandbox, APP_USR- for production.",
    };
  }
  if (t.startsWith("TEST-")) {
    return { kind: "ok", line: `MP_ACCESS_TOKEN set (TEST- prefix → sandbox)` };
  }
  if (t.startsWith("APP_USR-")) {
    return {
      kind: "warn",
      line: `MP_ACCESS_TOKEN set (APP_USR- prefix → PRODUCTION)`,
      detail: "Live transactions WILL move real money. Use TEST- in development.",
    };
  }
  return {
    kind: "fail",
    line: "MP_ACCESS_TOKEN has unexpected prefix",
    detail: `Expected TEST- or APP_USR-, got "${t.slice(0, 8)}…". Common cause: trailing newline in env file (use printf, not echo).`,
  };
}

async function probeToken(token: string): Promise<CheckResult> {
  try {
    const res = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      return {
        kind: "fail",
        line: "Token rejected by MP API (401 Unauthorized)",
        detail: "Token is invalid, expired, or copy-pasted with extra whitespace.",
      };
    }
    if (!res.ok) {
      return {
        kind: "fail",
        line: `MP API responded with HTTP ${res.status}`,
        detail: `Unexpected status — try again or check api.mercadopago.com status.`,
      };
    }
    const me = (await res.json()) as {
      id?: number;
      site_id?: string;
      email?: string;
      country_id?: string;
    };
    return {
      kind: "ok",
      line: `Authenticated against api.mercadopago.com`,
      detail: `account ${me.id ?? "?"} · site ${me.site_id ?? "?"} · country ${me.country_id ?? "?"}`,
    };
  } catch (err) {
    return {
      kind: "fail",
      line: "Could not reach api.mercadopago.com",
      detail:
        err instanceof Error ? err.message : "Unknown network error. Check connectivity / proxy.",
    };
  }
}

async function checkPeerDep(name: string, required: boolean): Promise<CheckResult> {
  try {
    await import(name);
    return { kind: "ok", line: `${name} installed` };
  } catch {
    return {
      kind: required ? "fail" : "warn",
      line: `${name} not installed`,
      detail: required
        ? `Required peer dep — install with: pnpm add ${name}`
        : `Optional — required only if you use the matching subpath.`,
    };
  }
}

function checkBackUrl(): CheckResult {
  const url = process.env.NEXT_PUBLIC_BACK_URL ?? process.env.BACK_URL;
  if (!url) {
    return {
      kind: "warn",
      line: "NEXT_PUBLIC_BACK_URL not set",
      detail:
        "Required by mercadoPagoTools({ backUrl }) for create_subscription / create_payment_preference. Must be HTTPS (localhost rejected by MP in production).",
    };
  }
  if (!url.startsWith("https://")) {
    return {
      kind: "fail",
      line: `NEXT_PUBLIC_BACK_URL must be HTTPS (got: ${url.slice(0, 40)}…)`,
      detail: "MP rejects localhost and http:// URLs server-side.",
    };
  }
  return { kind: "ok", line: `NEXT_PUBLIC_BACK_URL set (${url})` };
}

function checkWebhookSecret(): CheckResult {
  const s = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!s) {
    return {
      kind: "warn",
      line: "MP_WEBHOOK_SECRET not set",
      detail:
        "verifyWebhookSignature() needs this. Copy from https://www.mercadopago.com.ar/developers/panel/app → notificaciones.",
    };
  }
  if (s.length < 16) {
    return {
      kind: "warn",
      line: `MP_WEBHOOK_SECRET set but suspiciously short (${s.length} chars)`,
      detail: "MP secrets are typically 32+ chars. Double-check the paste.",
    };
  }
  return { kind: "ok", line: `MP_WEBHOOK_SECRET set (${s.length} chars)` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools manifest
// ─────────────────────────────────────────────────────────────────────────────

type Manifest = {
  package: string;
  version: string;
  tools: Array<{ name: string; category?: string; description?: string }>;
};

async function loadManifest(): Promise<Manifest | null> {
  // Bundled output lives at dist/cli.js. tools.manifest.json sits at the
  // package root, one level up. The src path src/cli-doctor.ts is also one
  // level up. Both resolve via "../tools.manifest.json".
  const fs = await import("node:fs/promises");
  for (const rel of ["../tools.manifest.json", "../../tools.manifest.json"]) {
    try {
      const url = new URL(rel, import.meta.url);
      const text = await fs.readFile(url, "utf-8");
      return JSON.parse(text) as Manifest;
    } catch {
      // try next
    }
  }
  return null;
}

function summarizeManifest(m: Manifest): string[] {
  const lines: string[] = [];
  lines.push(c("bold", `Tools registered: ${m.tools.length}`));

  // Group by inferred category from name prefix.
  const groups = new Map<string, string[]>();
  for (const tool of m.tools) {
    const cat = tool.category ?? inferCategory(tool.name);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(tool.name);
  }
  for (const [cat, names] of [...groups.entries()].sort()) {
    lines.push(`  ${c("dim", "→")} ${cat} (${names.length})`);
  }
  return lines;
}

function inferCategory(toolName: string): string {
  if (toolName.includes("subscription") || toolName.includes("preapproval")) return "Subscriptions";
  if (toolName.includes("payment") && !toolName.includes("preference")) return "Payments";
  if (toolName.includes("refund")) return "Refunds";
  if (toolName.includes("preference") || toolName.includes("checkout")) return "Checkout Pro";
  if (toolName.includes("oauth") || toolName.includes("marketplace")) return "Marketplace OAuth";
  if (toolName.includes("merchant_order") || toolName.includes("order")) return "Order Management";
  if (toolName.includes("customer") && !toolName.includes("card")) return "Customers";
  if (toolName.includes("customer_card") || toolName.includes("card")) return "Saved cards";
  if (toolName.includes("installment") || toolName.includes("cuotas") || toolName.includes("promo")) return "Cuotas";
  if (toolName.includes("qr")) return "QR";
  if (toolName.includes("3ds") || toolName.includes("challenge")) return "3DS";
  if (toolName.includes("point")) return "Point devices";
  if (toolName.includes("store") || toolName.includes("pos")) return "Stores+POS";
  if (toolName.includes("balance") || toolName.includes("settlement") || toolName.includes("account")) return "Account/Balance";
  if (toolName.includes("dispute")) return "Disputes";
  if (toolName.includes("webhook")) return "Webhooks";
  if (toolName.includes("bank_account")) return "Bank Accounts";
  if (toolName.includes("lookup") || toolName.includes("validate") || toolName.includes("explain") || toolName.includes("compute")) return "Lookups";
  return "Other";
}

const HITL_TOOLS = [
  "refund_payment",
  "cancel_subscription",
  "pause_subscription",
  "cancel_payment_preference",
  "delete_customer_card",
  "cancel_qr_dynamic",
  "delete_pos",
  "revoke_marketplace_token",
];

// ─────────────────────────────────────────────────────────────────────────────
// Main entrypoint
// ─────────────────────────────────────────────────────────────────────────────

export async function runDoctor(args: { probe: boolean } = { probe: false }): Promise<number> {
  const lines: string[] = [];
  lines.push("");
  lines.push(c("bold", `${c("cyan", "@ar-agents/mercadopago")} doctor`));
  lines.push(c("dim", "  diagnosing your environment"));
  lines.push("");

  // Environment checks.
  lines.push(fmt(checkNode()));

  const tokenCheck = checkAccessToken();
  lines.push(fmt(tokenCheck));

  if (tokenCheck.kind === "ok" || tokenCheck.kind === "warn") {
    const probe = await probeToken(process.env.MP_ACCESS_TOKEN!.trim());
    lines.push(fmt(probe));
  }

  lines.push(fmt(checkBackUrl()));
  lines.push(fmt(checkWebhookSecret()));

  // Peer deps.
  lines.push(fmt(await checkPeerDep("ai", true)));
  lines.push(fmt(await checkPeerDep("zod", true)));
  lines.push(fmt(await checkPeerDep("@vercel/kv", false)));
  lines.push(fmt(await checkPeerDep("@opentelemetry/api", false)));

  lines.push("");

  // Tools manifest.
  const manifest = await loadManifest();
  if (manifest) {
    lines.push(...summarizeManifest(manifest));
    lines.push("");
    lines.push(
      c(
        "yellow",
        `${HITL_TOOLS.length} irreversible ops behind requireConfirmation():`,
      ),
    );
    lines.push("  " + c("dim", HITL_TOOLS.join(" · ")));
  } else {
    lines.push(
      fmt({
        kind: "warn",
        line: "Could not load tools.manifest.json",
        detail: "The package shipping is incomplete — reinstall.",
      }),
    );
  }

  lines.push("");

  // Probe mode (extra dry-call).
  if (args.probe && tokenCheck.kind === "ok") {
    lines.push(c("bold", "Probe mode: dry-calling validate_tax_id…"));
    try {
      const res = await fetch("https://api.mercadopago.com/v1/identification_types", {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN!.trim()}` },
      });
      if (res.ok) {
        const types = (await res.json()) as Array<{ id: string }>;
        lines.push(
          fmt({
            kind: "ok",
            line: `validate_tax_id reachable — ${types.length} ID types available`,
          }),
        );
      } else {
        lines.push(
          fmt({
            kind: "warn",
            line: `validate_tax_id probe returned HTTP ${res.status}`,
          }),
        );
      }
    } catch (err) {
      lines.push(
        fmt({
          kind: "warn",
          line: "Probe failed",
          detail: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    lines.push("");
  }

  lines.push(
    c(
      "dim",
      args.probe
        ? "All probes done. Pass without --probe for the lighter check."
        : "Run with --probe to also dry-call validate_tax_id (no charge).",
    ),
  );

  process.stdout.write(lines.join("\n") + "\n");

  // Exit code: 0 if everything was ok or warn, 1 if any fail.
  const hasFail = lines.some((l) => l.includes("✗"));
  return hasFail ? 1 : 0;
}
