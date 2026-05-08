/**
 * `shipping doctor` — diagnoses the @ar-agents/shipping environment.
 *
 * The package wraps three carriers, each with its own credentials. None
 * is required; the doctor reports which carriers are wired and which
 * tools fall back to MockShippingAdapter.
 *
 *   Andreani: client_id + client_secret + contract number
 *   OCA: usuario + password + cuit + operativa
 *   Correo Argentino: api_key
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
  return { kind: "fail", line: `Node ${process.versions.node} too old`, detail: "Requires 20+." };
}

function checkAndreani(): CheckResult {
  const id = process.env.ANDREANI_CLIENT_ID?.trim();
  const secret = process.env.ANDREANI_CLIENT_SECRET?.trim();
  const contract = process.env.ANDREANI_CONTRACT?.trim();
  const present = [id, secret, contract].filter(Boolean).length;

  if (present === 0) {
    return {
      kind: "warn",
      line: "Andreani not configured",
      detail: "Set ANDREANI_CLIENT_ID + ANDREANI_CLIENT_SECRET + ANDREANI_CONTRACT to enable cotizar/crear/trackear/cancelar via Andreani.",
    };
  }
  if (present < 3) {
    return {
      kind: "fail",
      line: `Andreani partially configured (${present}/3 vars set)`,
      detail: "Need ANDREANI_CLIENT_ID + ANDREANI_CLIENT_SECRET + ANDREANI_CONTRACT.",
    };
  }
  return { kind: "ok", line: `Andreani configured (contract ${contract!.slice(0, 4)}…)` };
}

function checkOca(): CheckResult {
  const present = [
    process.env.OCA_USUARIO,
    process.env.OCA_PASSWORD,
    process.env.OCA_CUIT,
    process.env.OCA_OPERATIVA,
  ].filter(Boolean).length;

  if (present === 0) {
    return {
      kind: "warn",
      line: "OCA not configured",
      detail: "Set OCA_USUARIO + OCA_PASSWORD + OCA_CUIT + OCA_OPERATIVA to enable cotizar via OCA. Crear/trackear/cancelar require E-Pak SOAP (planned for v0.2).",
    };
  }
  if (present < 4) {
    return { kind: "fail", line: `OCA partially configured (${present}/4 vars set)` };
  }
  return { kind: "ok", line: "OCA configured (cotizar + sucursales available)" };
}

function checkCorreo(): CheckResult {
  const k = process.env.CORREO_API_KEY?.trim();
  if (!k) {
    return {
      kind: "warn",
      line: "Correo Argentino not configured",
      detail: "Set CORREO_API_KEY to enable cotizar/trackear via Correo Argentino.",
    };
  }
  return { kind: "ok", line: "Correo Argentino configured" };
}

async function checkPeerDep(name: string): Promise<CheckResult> {
  try {
    await import(name);
    return { kind: "ok", line: `${name} installed` };
  } catch {
    return { kind: "fail", line: `${name} not installed`, detail: `Required: pnpm add ${name}` };
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
  lines.push(c("bold", `${c("cyan", "@ar-agents/shipping")} doctor`));
  lines.push(c("dim", "  diagnosing your carriers"));
  lines.push("");

  lines.push(fmt(checkNode()));
  lines.push("");
  lines.push(c("bold", "Carriers:"));
  lines.push(fmt(checkAndreani()));
  lines.push(fmt(checkOca()));
  lines.push(fmt(checkCorreo()));
  lines.push("");
  lines.push(fmt(await checkPeerDep("ai")));
  lines.push(fmt(await checkPeerDep("zod")));
  lines.push("");

  const manifest = await loadManifest();
  if (manifest) {
    lines.push(c("bold", `Tools registered: ${manifest.tools.length}`));
    for (const t of manifest.tools) lines.push(`  ${c("dim", "→")} ${t.name}`);
    lines.push("");
    lines.push(
      c("yellow", "cotizar_envio_todos compares all configured carriers in parallel and returns the cheapest."),
    );
  }
  lines.push("");

  process.stdout.write(lines.join("\n") + "\n");
  return lines.some((l) => l.includes("✗")) ? 1 : 0;
}
