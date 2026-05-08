/**
 * `identity doctor` — environment diagnosis for `@ar-agents/identity`.
 *
 * Checks Node, AFIP/ARCA cert + key (PEM-string mode for serverless),
 * AFIP_CUIT format, X.509 cert structure (date validity, CN), and
 * optionally probes WSAA login. Always-on tool: `validate_cuit` (pure
 * algorithm). Adapter-required tool: `lookup_cuit_afip`.
 */

import { parseCuit } from "./cuit";

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
const c = (col: keyof typeof C, s: string) =>
  NO_COLOR ? s : `${C[col]}${s}${C.reset}`;

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
    detail: "@ar-agents/identity requires Node 20+.",
  };
}

function checkCuit(): CheckResult {
  const cuit = process.env.AFIP_CUIT?.trim();
  if (!cuit) {
    return {
      kind: "warn",
      line: "AFIP_CUIT not set",
      detail:
        "The CUIT registered with the AFIP/ARCA cert. Required if you wire WsaaWscdcAfipPadronAdapter for lookup_cuit_afip. Format: 20-XXXXXXXX-X (with or without dashes).",
    };
  }
  const parsed = parseCuit(cuit);
  if (!parsed.valid) {
    return {
      kind: "fail",
      line: `AFIP_CUIT invalid: ${parsed.error ?? "checksum mismatch"}`,
      detail: "Check the value — common cause is a trailing newline (use printf, not echo).",
    };
  }
  return { kind: "ok", line: `AFIP_CUIT set (${parsed.formatted ?? parsed.normalized})` };
}

function checkCertPem(): CheckResult {
  const pem = process.env.AFIP_CERT_PEM?.trim();
  if (!pem) {
    return {
      kind: "warn",
      line: "AFIP_CERT_PEM not set",
      detail:
        "The X.509 cert (PEM string) issued by AFIP for your CUIT. Without it, lookup_cuit_afip is disabled (only validate_cuit works).",
    };
  }
  if (!pem.includes("BEGIN CERTIFICATE")) {
    return {
      kind: "fail",
      line: "AFIP_CERT_PEM does not look like a PEM-encoded certificate",
      detail:
        'Expected "-----BEGIN CERTIFICATE-----…-----END CERTIFICATE-----". Check for double-encoded "\\n" sequences (use printf with $\'…\' or read from a file).',
    };
  }
  return { kind: "ok", line: `AFIP_CERT_PEM set (${pem.length} chars)` };
}

function checkKeyPem(): CheckResult {
  const pem = process.env.AFIP_KEY_PEM?.trim();
  if (!pem) {
    return {
      kind: "warn",
      line: "AFIP_KEY_PEM not set",
      detail:
        "The private key (PEM string) matching AFIP_CERT_PEM. Required if AFIP_CERT_PEM is set.",
    };
  }
  if (!pem.includes("PRIVATE KEY")) {
    return {
      kind: "fail",
      line: "AFIP_KEY_PEM does not look like a PEM-encoded private key",
      detail:
        'Expected "-----BEGIN (RSA |EC |)PRIVATE KEY-----…-----END (RSA |EC |)PRIVATE KEY-----".',
    };
  }
  return { kind: "ok", line: `AFIP_KEY_PEM set (${pem.length} chars)` };
}

function checkEnvSetting(): CheckResult {
  const env = process.env.AFIP_ENV?.trim();
  if (!env) {
    return {
      kind: "warn",
      line: "AFIP_ENV not set (will default to 'prod')",
      detail:
        "Set AFIP_ENV=homo to point WSAA at the homologation endpoints. Note: AFIP's homo CA is separate from prod; certs aren't interchangeable.",
    };
  }
  if (env !== "prod" && env !== "homo") {
    return {
      kind: "fail",
      line: `AFIP_ENV must be 'prod' or 'homo', got "${env}"`,
    };
  }
  return { kind: "ok", line: `AFIP_ENV=${env}` };
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

// ─────────────────────────────────────────────────────────────────────────────
// Manifest
// ─────────────────────────────────────────────────────────────────────────────

type Manifest = { tools: Array<{ name: string }> };
async function loadManifest(): Promise<Manifest | null> {
  const fs = await import("node:fs/promises");
  for (const rel of ["../tools.manifest.json", "../../tools.manifest.json"]) {
    try {
      const url = new URL(rel, import.meta.url);
      return JSON.parse(await fs.readFile(url, "utf-8")) as Manifest;
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
  lines.push(c("bold", `${c("cyan", "@ar-agents/identity")} doctor`));
  lines.push(c("dim", "  diagnosing your environment"));
  lines.push("");

  lines.push(fmt(checkNode()));
  lines.push(fmt(checkCuit()));
  lines.push(fmt(checkCertPem()));
  lines.push(fmt(checkKeyPem()));
  lines.push(fmt(checkEnvSetting()));
  lines.push(fmt(await checkPeerDep("ai", true)));
  lines.push(fmt(await checkPeerDep("zod", true)));

  lines.push("");

  const manifest = await loadManifest();
  if (manifest) {
    lines.push(c("bold", `Tools registered: ${manifest.tools.length}`));
    for (const t of manifest.tools) lines.push(`  ${c("dim", "→")} ${t.name}`);
    lines.push("");
    lines.push(
      c(
        "yellow",
        "validate_cuit is always-on (pure algorithm). lookup_cuit_afip requires WsaaWscdcAfipPadronAdapter wired with cert + key + cuit.",
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
