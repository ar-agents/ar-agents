/**
 * `banking doctor` — diagnoses the @ar-agents/banking environment.
 *
 * 4 tools are pure algorithm and always work (`validate_cbu`,
 * `lookup_bank_by_code`, `list_banks`, `list_psps`). 1 tool requires the
 * BCRA Central de Deudores adapter (`lookup_credit_situation`). The 6 BCRA
 * Principales Variables tools (`get_usd_oficial`, `get_cer`, `get_uva`,
 * `get_reservas_bcra`, `list_bcra_variables`, `get_bcra_variable`) hit a
 * free public BCRA endpoint, so we probe it.
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
    detail: "@ar-agents/banking requires Node 20+.",
  };
}

async function probeBcraVariables(): Promise<CheckResult> {
  // BCRA's Principales Variables API is free, public, no auth. If it
  // responds, the 6 BCRA tools work end-to-end.
  try {
    const res = await fetch(
      "https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias",
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) {
      return {
        kind: "warn",
        line: `BCRA Principales Variables responded HTTP ${res.status}`,
        detail: "BCRA endpoints are public; transient 5xx is normal. Re-run.",
      };
    }
    const data = (await res.json()) as { results?: unknown[] };
    const count = Array.isArray(data.results) ? data.results.length : 0;
    return {
      kind: "ok",
      line: `BCRA Principales Variables reachable (${count} series available)`,
    };
  } catch (err) {
    return {
      kind: "warn",
      line: "Could not reach api.bcra.gob.ar",
      detail: err instanceof Error ? err.message : "Unknown network error.",
    };
  }
}

function checkBcraDeudoresAdapter(): CheckResult {
  // The BCRA Central de Deudores lookup is the one tool that's adapter-required.
  // Most users won't have it wired — the toolkit's built-in HTTP client is
  // configured by env vars in @ar-agents/banking.
  const url = process.env.BCRA_DEUDORES_URL?.trim();
  if (!url) {
    return {
      kind: "warn",
      line: "BCRA_DEUDORES_URL not set",
      detail:
        "Required by lookup_credit_situation. The 4 algorithm-only tools and the 6 Principales Variables tools work without it.",
    };
  }
  if (!url.startsWith("https://")) {
    return {
      kind: "fail",
      line: "BCRA_DEUDORES_URL must be HTTPS",
    };
  }
  return { kind: "ok", line: `BCRA_DEUDORES_URL set (${new URL(url).host})` };
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
  lines.push(c("bold", `${c("cyan", "@ar-agents/banking")} doctor`));
  lines.push(c("dim", "  diagnosing your environment"));
  lines.push("");

  lines.push(fmt(checkNode()));
  lines.push(fmt(await probeBcraVariables()));
  lines.push(fmt(checkBcraDeudoresAdapter()));
  lines.push(fmt(await checkPeerDep("ai", true)));
  lines.push(fmt(await checkPeerDep("zod", true)));
  lines.push("");

  const manifest = await loadManifest();
  if (manifest) {
    lines.push(c("bold", `Tools registered: ${manifest.tools.length}`));
    const groups: Record<string, string[]> = {
      "Algorithm-only (always work, free)": [
        "validate_cbu",
        "lookup_bank_by_code",
        "list_banks",
        "list_psps",
      ],
      "BCRA public endpoint (free, no auth)": [
        "get_usd_oficial",
        "get_cer",
        "get_uva",
        "get_reservas_bcra",
        "list_bcra_variables",
        "get_bcra_variable",
      ],
      "Adapter-required": ["lookup_credit_situation"],
    };
    for (const [group, names] of Object.entries(groups)) {
      lines.push(`  ${c("dim", group)}`);
      for (const n of names) {
        const present = manifest.tools.some((t) => t.name === n);
        lines.push(`    ${present ? c("green", "✓") : c("dim", "·")} ${n}`);
      }
    }
  }
  lines.push("");

  process.stdout.write(lines.join("\n") + "\n");
  return lines.some((l) => l.includes("✗")) ? 1 : 0;
}
