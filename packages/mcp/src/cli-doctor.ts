/**
 * `ar-agents-mcp doctor` — diagnoses the MCP host bundle.
 *
 * The bundle exposes any of the 7 underlying packages over MCP, deciding
 * which to enable based on env vars. The doctor's job is to make that
 * decision visible: which packages are wired, which tools each one
 * contributes, which env vars are missing for the rest.
 *
 * Treat this as the canonical "is my MCP host configured for AR ops"
 * checklist. Useful in Claude Desktop / Cursor / Continue configs.
 */

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};
const NO_COLOR = process.env.NO_COLOR != null || !process.stdout.isTTY;
const c = (col: keyof typeof C, s: string) =>
  NO_COLOR ? s : `${C[col]}${s}${C.reset}`;

type Status = "enabled" | "partial" | "disabled";

type SubpackageState = {
  name: string;
  status: Status;
  toolCount: number;
  required: string[]; // env vars that must be set together
  missing: string[]; // missing env vars (subset of required)
  alwaysOn: string[]; // tools that work regardless of config
};

function evalSubpackage(input: {
  name: string;
  required: string[];
  alwaysOn?: string[];
  toolCount: number;
}): SubpackageState {
  const missing = input.required.filter((e) => !process.env[e]?.trim());
  const allMissing = missing.length === input.required.length;
  const someMissing = missing.length > 0 && !allMissing;
  const status: Status = allMissing ? "disabled" : someMissing ? "partial" : "enabled";
  return {
    name: input.name,
    required: input.required,
    missing,
    alwaysOn: input.alwaysOn ?? [],
    toolCount: input.toolCount,
    status,
  };
}

function fmtSub(s: SubpackageState): string[] {
  const icon =
    s.status === "enabled"
      ? c("green", "●")
      : s.status === "partial"
        ? c("yellow", "◐")
        : c("dim", "○");
  const label =
    s.status === "enabled"
      ? c("green", "enabled")
      : s.status === "partial"
        ? c("yellow", `partial — missing ${s.missing.join(", ")}`)
        : c("dim", "disabled (set env vars to enable)");
  const lines = [`${icon} ${c("bold", s.name)} — ${label}`];
  if (s.status === "disabled" && s.alwaysOn.length > 0) {
    lines.push(
      c("dim", `    always-on tools: ${s.alwaysOn.join(", ")}`),
    );
  }
  if (s.status === "disabled") {
    lines.push(c("dim", `    requires: ${s.required.join(", ")}`));
  }
  return lines;
}

export async function runDoctor(): Promise<number> {
  const lines: string[] = [];
  lines.push("");
  lines.push(c("bold", `${c("cyan", "@ar-agents/mcp")} doctor`));
  lines.push(c("dim", "  which @ar-agents/* subpackages your MCP host has wired"));
  lines.push("");

  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) {
    lines.push(`${c("red", "✗")} Node ${process.versions.node} too old — requires 20+`);
    process.stdout.write(lines.join("\n") + "\n");
    return 1;
  }
  lines.push(`${c("green", "✓")} Node ${process.versions.node}`);
  lines.push("");

  const subpackages: SubpackageState[] = [
    // Identity is always-on for `validate_cuit` (algorithm).
    evalSubpackage({
      name: "@ar-agents/identity",
      required: ["AFIP_CERT_PEM", "AFIP_KEY_PEM", "AFIP_CUIT"],
      alwaysOn: ["validate_cuit"],
      toolCount: 2,
    }),
    evalSubpackage({
      name: "@ar-agents/mercadopago",
      required: ["MP_ACCESS_TOKEN"],
      toolCount: 89,
    }),
    evalSubpackage({
      name: "@ar-agents/whatsapp",
      required: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
      toolCount: 6,
    }),
    evalSubpackage({
      name: "@ar-agents/identity-attest",
      required: ["ATTESTATION_HMAC_SECRET"],
      toolCount: 5,
    }),
    // Banking is always-on for the 4 algorithm-only + 6 BCRA-public tools.
    evalSubpackage({
      name: "@ar-agents/banking",
      required: ["BCRA_DEUDORES_URL"],
      alwaysOn: [
        "validate_cbu",
        "lookup_bank_by_code",
        "list_banks",
        "list_psps",
        "get_usd_oficial",
        "get_cer",
        "get_uva",
        "get_reservas_bcra",
        "list_bcra_variables",
        "get_bcra_variable",
      ],
      toolCount: 11,
    }),
    evalSubpackage({
      name: "@ar-agents/facturacion",
      required: ["AFIP_CERT_PEM", "AFIP_KEY_PEM", "AFIP_CUIT"],
      toolCount: 10,
    }),
    evalSubpackage({
      name: "@ar-agents/shipping",
      required: [], // no required vars; carriers are individually optional
      alwaysOn: [
        "cotizar_envio (mock)",
        "cotizar_envio_todos (mock)",
        "trackear_envio (mock)",
      ],
      toolCount: 6,
    }),
  ];

  for (const sub of subpackages) {
    for (const line of fmtSub(sub)) lines.push(line);
  }
  lines.push("");

  // Summary
  const enabled = subpackages.filter((s) => s.status === "enabled").length;
  const partial = subpackages.filter((s) => s.status === "partial").length;
  const disabled = subpackages.filter((s) => s.status === "disabled").length;
  const totalTools = subpackages
    .filter((s) => s.status === "enabled")
    .reduce((acc, s) => acc + s.toolCount, 0);

  lines.push(c("bold", "Summary"));
  lines.push(`  ${c("green", `enabled: ${enabled}`)} · ${c("yellow", `partial: ${partial}`)} · ${c("dim", `disabled: ${disabled}`)}`);
  lines.push(`  exposed tools: ${c("magenta", String(totalTools))}/123 (with current env)`);
  lines.push("");

  // Suggest the canonical Claude Desktop / Cursor config snippet
  if (enabled === 0) {
    lines.push(
      c(
        "yellow",
        "No subpackage is enabled. Set MP_ACCESS_TOKEN, AFIP_CERT_PEM/KEY/CUIT, " +
          "WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID etc. in your MCP host config. " +
          "See the README for the canonical Claude Desktop snippet.",
      ),
    );
  } else if (totalTools < 100) {
    lines.push(
      c(
        "yellow",
        "Partial coverage. The full @ar-agents/* surface is 123 tools — wire the " +
          "remaining subpackages for an end-to-end AR ops layer.",
      ),
    );
  }
  lines.push("");

  process.stdout.write(lines.join("\n") + "\n");
  // Exit 0 if at least one subpackage is enabled — disabled is informational, not a failure.
  return enabled === 0 && partial === 0 ? 0 : 0;
}
