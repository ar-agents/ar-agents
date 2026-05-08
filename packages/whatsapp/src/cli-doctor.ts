/**
 * `whatsapp doctor` — environment diagnosis for `@ar-agents/whatsapp`.
 *
 * Checks Node, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, peer deps,
 * and pings the Meta Graph API to verify the credentials. Lists the 6
 * registered tools and the `scopedTo` mode pattern.
 *
 * No third-party CLI deps. ANSI inlined; respects NO_COLOR.
 */

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
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
// Checks
// ─────────────────────────────────────────────────────────────────────────────

function checkNode(): CheckResult {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) return { kind: "ok", line: `Node ${process.versions.node} (>= 20.0.0)` };
  return {
    kind: "fail",
    line: `Node ${process.versions.node} too old`,
    detail: "@ar-agents/whatsapp requires Node 20+. Edge Runtime + Bun also supported.",
  };
}

function checkAccessToken(): CheckResult {
  const t = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!t) {
    return {
      kind: "fail",
      line: "WHATSAPP_ACCESS_TOKEN not set",
      detail:
        "Get a permanent token at developers.facebook.com → your app → WhatsApp → API Setup → System User. Permanent tokens start with EAA…",
    };
  }
  if (t.startsWith("EAA")) {
    return { kind: "ok", line: "WHATSAPP_ACCESS_TOKEN set (EAA prefix → Meta token)" };
  }
  return {
    kind: "warn",
    line: "WHATSAPP_ACCESS_TOKEN set, but unexpected prefix",
    detail: `Expected EAA…, got "${t.slice(0, 6)}…". Meta tokens start with EAA. If you generated a temporary "User Access Token" you need a System User token for production.`,
  };
}

function checkPhoneNumberId(): CheckResult {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!id) {
    return {
      kind: "fail",
      line: "WHATSAPP_PHONE_NUMBER_ID not set",
      detail:
        "Find it at developers.facebook.com → WhatsApp → API Setup → 'From' phone number → the long numeric ID below the phone number, NOT the phone number itself.",
    };
  }
  if (!/^\d+$/.test(id)) {
    return {
      kind: "fail",
      line: `WHATSAPP_PHONE_NUMBER_ID is not numeric (got: ${id.slice(0, 8)}…)`,
      detail:
        "This must be the numeric phone-number-id from Meta, not the +E.164 phone number itself.",
    };
  }
  return { kind: "ok", line: `WHATSAPP_PHONE_NUMBER_ID set (${id.length} digits)` };
}

async function probeGraphApi(token: string, phoneId: string): Promise<CheckResult> {
  const url = `https://graph.facebook.com/v23.0/${phoneId}?fields=id,display_phone_number,verified_name,quality_rating`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      return {
        kind: "fail",
        line: "Token rejected by Meta (401 Unauthorized)",
        detail:
          "Token is invalid, expired, or scoped to a different app. System User tokens don't expire; user tokens expire in 60 days.",
      };
    }
    if (res.status === 404) {
      return {
        kind: "fail",
        line: "Phone-number-id not found (404)",
        detail:
          "The token is valid but doesn't have access to this phone-number-id. Confirm it matches your WABA.",
      };
    }
    if (!res.ok) {
      return {
        kind: "fail",
        line: `Meta Graph API responded with HTTP ${res.status}`,
        detail: "Unexpected status — check Meta status / token / phone-number-id.",
      };
    }
    const me = (await res.json()) as {
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
    };
    return {
      kind: "ok",
      line: "Authenticated against graph.facebook.com",
      detail: `phone ${me.display_phone_number ?? "?"} · "${me.verified_name ?? "?"}" · quality ${me.quality_rating ?? "?"}`,
    };
  } catch (err) {
    return {
      kind: "fail",
      line: "Could not reach graph.facebook.com",
      detail: err instanceof Error ? err.message : "Unknown network error.",
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
      detail: required ? `Required: pnpm add ${name}` : "Optional.",
    };
  }
}

function checkWebhookSecret(): CheckResult {
  const s = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!s) {
    return {
      kind: "warn",
      line: "WHATSAPP_APP_SECRET not set",
      detail:
        "Required by verifyWebhookSignature(). Find it at developers.facebook.com → your app → Settings → Basic → App Secret.",
    };
  }
  if (s.length !== 32) {
    return {
      kind: "warn",
      line: `WHATSAPP_APP_SECRET set but unexpected length (${s.length} chars)`,
      detail: "Meta App Secrets are typically 32 hex chars. Double-check the paste.",
    };
  }
  return { kind: "ok", line: `WHATSAPP_APP_SECRET set (32 chars)` };
}

function checkVerifyToken(): CheckResult {
  const v = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!v) {
    return {
      kind: "warn",
      line: "WHATSAPP_VERIFY_TOKEN not set",
      detail:
        "Required for the webhook subscription handshake (verifyWebhookSubscription). Pick any random string and paste it both in your env and in the Meta webhook setup form.",
    };
  }
  return { kind: "ok", line: `WHATSAPP_VERIFY_TOKEN set` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest summary
// ─────────────────────────────────────────────────────────────────────────────

type Manifest = {
  package: string;
  version: string;
  tools: Array<{ name: string }>;
};

async function loadManifest(): Promise<Manifest | null> {
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

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export async function runDoctor(): Promise<number> {
  const lines: string[] = [];
  lines.push("");
  lines.push(c("bold", `${c("cyan", "@ar-agents/whatsapp")} doctor`));
  lines.push(c("dim", "  diagnosing your environment"));
  lines.push("");

  lines.push(fmt(checkNode()));
  const tokenCheck = checkAccessToken();
  lines.push(fmt(tokenCheck));
  const phoneCheck = checkPhoneNumberId();
  lines.push(fmt(phoneCheck));

  if (tokenCheck.kind !== "fail" && phoneCheck.kind === "ok") {
    const probe = await probeGraphApi(
      process.env.WHATSAPP_ACCESS_TOKEN!.trim(),
      process.env.WHATSAPP_PHONE_NUMBER_ID!.trim(),
    );
    lines.push(fmt(probe));
  }

  lines.push(fmt(checkWebhookSecret()));
  lines.push(fmt(checkVerifyToken()));
  lines.push(fmt(await checkPeerDep("ai", true)));
  lines.push(fmt(await checkPeerDep("zod", true)));

  lines.push("");

  const manifest = await loadManifest();
  if (manifest) {
    lines.push(c("bold", `Tools registered: ${manifest.tools.length}`));
    for (const tool of manifest.tools) {
      lines.push(`  ${c("dim", "→")} ${tool.name}`);
    }
    lines.push("");
    lines.push(
      c(
        "yellow",
        "scopedTo mode: bind outbound tools to a single sender by passing { phoneNumberId, scopedTo } to whatsappTools(). Recommended when an agent serves only one customer thread.",
      ),
    );
  } else {
    lines.push(
      fmt({
        kind: "warn",
        line: "Could not load tools.manifest.json",
        detail: "Reinstall the package — shipping is incomplete.",
      }),
    );
  }

  lines.push("");

  process.stdout.write(lines.join("\n") + "\n");
  return lines.some((l) => l.includes("✗")) ? 1 : 0;
}
