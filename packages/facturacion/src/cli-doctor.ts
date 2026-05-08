/**
 * `facturacion doctor` — diagnoses the @ar-agents/facturacion environment.
 *
 * AFIP/ARCA WSFE requires:
 *   - X.509 cert (PEM string) registered with the WSFE service
 *   - Matching private key
 *   - Issuer CUIT
 *
 * Plus:
 *   - AFIP_ENV ∈ {prod, homo} — separate cert chains
 *   - At least one configured Punto de Venta (PdV) on the AFIP/ARCA panel
 *
 * The doctor parses the cert briefly to surface the CUIT it's actually
 * registered to (not the env var, which a user can paste wrong).
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

function checkNode(): CheckResult {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) return { kind: "ok", line: `Node ${process.versions.node} (>= 20.0.0)` };
  return {
    kind: "fail",
    line: `Node ${process.versions.node} too old`,
    detail: "@ar-agents/facturacion requires Node 20+.",
  };
}

function checkCert(): CheckResult {
  const pem = process.env.AFIP_CERT_PEM?.trim();
  if (!pem) {
    return {
      kind: "fail",
      line: "AFIP_CERT_PEM not set",
      detail:
        "X.509 cert registered with the AFIP/ARCA WSFE service. The pre-flight validator works without it but actual emit calls will fail.",
    };
  }
  if (!pem.includes("BEGIN CERTIFICATE")) {
    return {
      kind: "fail",
      line: "AFIP_CERT_PEM does not look like a PEM-encoded certificate",
      detail: 'Expected "-----BEGIN CERTIFICATE-----…". Common cause: literal \\n sequences in env vars (use printf, not echo).',
    };
  }
  return { kind: "ok", line: `AFIP_CERT_PEM set (${pem.length} chars)` };
}

function checkKey(): CheckResult {
  const pem = process.env.AFIP_KEY_PEM?.trim();
  if (!pem) {
    return {
      kind: "fail",
      line: "AFIP_KEY_PEM not set",
      detail: "Private key matching AFIP_CERT_PEM. Required for any WSFE call.",
    };
  }
  if (!pem.includes("PRIVATE KEY")) {
    return { kind: "fail", line: "AFIP_KEY_PEM does not look like a PEM-encoded key" };
  }
  return { kind: "ok", line: `AFIP_KEY_PEM set (${pem.length} chars)` };
}

function checkCuit(): CheckResult {
  const cuit = process.env.AFIP_CUIT?.trim();
  if (!cuit) {
    return {
      kind: "fail",
      line: "AFIP_CUIT not set",
      detail: "The CUIT registered with the AFIP cert. Format: 20-XXXXXXXX-X (with or without dashes).",
    };
  }
  const digits = cuit.replace(/[^\d]/g, "");
  if (digits.length !== 11) {
    return { kind: "fail", line: `AFIP_CUIT must have 11 digits (got ${digits.length})` };
  }
  return { kind: "ok", line: `AFIP_CUIT set (${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)})` };
}

function checkEnv(): CheckResult {
  const env = process.env.AFIP_ENV?.trim();
  if (!env) {
    return {
      kind: "warn",
      line: "AFIP_ENV not set (will default to 'prod')",
      detail:
        "Use AFIP_ENV=homo for the homologation/staging environment. Note: prod and homo certs are NOT interchangeable.",
    };
  }
  if (env !== "prod" && env !== "homo") {
    return { kind: "fail", line: `AFIP_ENV must be 'prod' or 'homo' (got "${env}")` };
  }
  return { kind: "ok", line: `AFIP_ENV=${env}` };
}

function checkPtoVta(): CheckResult {
  const pv = process.env.AFIP_PTO_VTA?.trim();
  if (!pv) {
    return {
      kind: "warn",
      line: "AFIP_PTO_VTA not set",
      detail:
        "Default Punto de Venta. Without it, every crear_factura call must pass ptoVta explicitly. Configure your default PdV in the AFIP/ARCA panel (typically 1, 2, 3 …).",
    };
  }
  const n = Number(pv);
  if (!Number.isInteger(n) || n < 1 || n > 99999) {
    return { kind: "fail", line: `AFIP_PTO_VTA must be a positive integer (got "${pv}")` };
  }
  return { kind: "ok", line: `AFIP_PTO_VTA=${n}` };
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

export async function runDoctor(): Promise<number> {
  const lines: string[] = [];
  lines.push("");
  lines.push(c("bold", `${c("cyan", "@ar-agents/facturacion")} doctor`));
  lines.push(c("dim", "  diagnosing your environment"));
  lines.push("");

  lines.push(fmt(checkNode()));
  lines.push(fmt(checkCert()));
  lines.push(fmt(checkKey()));
  lines.push(fmt(checkCuit()));
  lines.push(fmt(checkEnv()));
  lines.push(fmt(checkPtoVta()));
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
        "Pre-flight validator catches the 10 most common rejection reasons (alícuotas mal sumadas, código IVA 21 vs 22, etc.) BEFORE the WSFE round-trip.",
      ),
    );
  }
  lines.push("");

  process.stdout.write(lines.join("\n") + "\n");
  return lines.some((l) => l.includes("✗")) ? 1 : 0;
}
