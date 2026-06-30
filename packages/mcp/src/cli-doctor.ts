/**
 * `ar-agents-mcp doctor` — diagnoses the MCP host bundle.
 *
 * The bundle exposes any of the underlying packages over MCP, deciding
 * which to enable based on env vars. The doctor's job is to make that
 * decision visible: which packages are wired, which tools each one
 * contributes, which env vars are missing for the rest — AND, in the
 * GOVERNANCE section, the art. 102 gate's exact blast radius: every exposed
 * tool, its resolved risk level, and whether it is GATED under the current
 * config. So an operator sees what default-ON refuses BEFORE/after upgrading.
 *
 * Treat this as the canonical "is my MCP host configured for AR ops"
 * checklist. Useful in Claude Desktop / Cursor / Continue configs.
 */

import { classifyTool, levelRequiresApproval } from "@ar-agents/core";
import { combineToolSets, type McpTool } from "./adapter";
import { describeGovernance, resolveGovernance } from "./governance";
import { buildBankingTools } from "./registries/banking";
import { buildBoletinOficialTools } from "./registries/boletin-oficial";
import { buildFacturacionTools } from "./registries/facturacion";
import { buildFirmaDigitalTools } from "./registries/firma-digital";
import { buildGdeTadTools } from "./registries/gde-tad";
import { buildIdentityTools } from "./registries/identity";
import { buildIdentityAttestTools } from "./registries/identity-attest";
import { buildIgjTools } from "./registries/igj";
import { buildMercadoLibreTools } from "./registries/mercadolibre";
import { buildMercadoPagoTools } from "./registries/mercadopago";
import { buildMiArgentinaTools } from "./registries/mi-argentina";
import { buildShippingTools } from "./registries/shipping";
import { buildWhatsAppTools } from "./registries/whatsapp";

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

/**
 * Build the exact tool surface the real server registers (same registries, same
 * order as {@link createServer}). Mirrors server.ts so the doctor's GOVERNANCE
 * section reflects what would actually be exposed under the current env.
 */
function buildExposedTools(): McpTool[] {
  return combineToolSets([
    buildIdentityTools(),
    buildMiArgentinaTools(),
    buildMercadoPagoTools(),
    buildMercadoLibreTools(),
    buildWhatsAppTools(),
    buildIdentityAttestTools(),
    buildBankingTools(),
    buildFacturacionTools(),
    buildShippingTools(),
    buildBoletinOficialTools(),
    buildIgjTools(),
    buildFirmaDigitalTools(),
    buildGdeTadTools(),
  ]).tools;
}

const LEVEL_COLOR: Record<string, keyof typeof C> = {
  read: "green",
  create: "cyan",
  money: "red",
  fiscal: "red",
  legal: "red",
  irreversible: "red",
  unknown: "yellow",
};

/**
 * GOVERNANCE section: the art. 102 gate's blast radius under the current config.
 * Lists every exposed tool with its resolved risk level and whether it is GATED,
 * then the effective enforce / approve-hook / halt state. The classification is
 * the SAME path the running server uses (name + description + sideEffects ->
 * @ar-agents/core classifyTool), so what you read here is what the gate does.
 */
function fmtGovernance(): string[] {
  const lines: string[] = [];
  const gov = resolveGovernance(); // reads env: enforce / halt
  lines.push(c("bold", "Governance (art. 102 gate)"));
  lines.push(c("dim", `  ${describeGovernance(gov)}`));

  // Building the surface can throw (e.g. a tool-name collision when two
  // registries both expose `get_order`). Degrade to a clear note rather than
  // crashing the whole doctor.
  let exposed: McpTool[];
  try {
    exposed = buildExposedTools();
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    lines.push(c("red", `  could not enumerate tools: ${why}`));
    lines.push("");
    return lines;
  }

  const tools = exposed
    .map((t) => {
      const level = classifyTool({
        name: t.name,
        description: t.description,
        sideEffects: t.sideEffects,
      });
      return { name: t.name, level, gated: levelRequiresApproval(level) };
    })
    .sort(
      (a, b) =>
        Number(b.gated) - Number(a.gated) || a.name.localeCompare(b.name),
    );

  const gatedCount = tools.filter((t) => t.gated).length;
  // What the gate DOES to a gated tool right now, given enforce/halt/hook.
  const haltOn = gov.isHalted != null;
  const fate = haltOn
    ? "ALL tools refuse (society_suspended)"
    : !gov.enforce
      ? "gate OFF — gated tools run ungated (passthrough)"
      : gov.approve
        ? "gated tools defer to your approve hook"
        : "gated tools fail-closed DENY (no approve hook)";
  lines.push(
    `  ${c("magenta", String(gatedCount))} of ${c("magenta", String(tools.length))} exposed tools are GATED → ${c("bold", fate)}`,
  );
  lines.push("");

  for (const t of tools) {
    const col = LEVEL_COLOR[t.level] ?? "yellow";
    // Pad the PLAIN label first, then colorize, so columns align with color on.
    const markLabel = t.gated
      ? haltOn
        ? "HALTED"
        : !gov.enforce
          ? "ungated"
          : "GATED"
      : "allowed";
    const markCol: keyof typeof C = t.gated
      ? haltOn
        ? "red"
        : !gov.enforce
          ? "dim"
          : "red"
      : "green";
    const mark = c(markCol, markLabel.padEnd(7));
    lines.push(`  ${mark} ${c(col, t.level.padEnd(12))} ${t.name}`);
  }
  lines.push("");
  if (gatedCount > 0 && gov.enforce && !gov.approve && !haltOn) {
    lines.push(
      c(
        "yellow",
        "  NOTE: default-ON fail-closed. ANY tool whose name is not a recognized " +
          "read verb classifies as `unknown` and is GATED — this currently includes " +
          "some registry/Boletín/firma/AFIP-catalog READ tools (e.g. igj_get_entity, " +
          "bo_search, firma_inspect_cert, obtener_alicuotas_iva). To let them run: wire " +
          "an approve hook via createServer({ governance: { approve } }), or set " +
          "AR_AGENTS_MCP_ENFORCE=off (ungated — NOT recommended for money/fiscal/legal acts).",
      ),
    );
    lines.push("");
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
    // gde-tad: validate_igj_inscription is always-on (algorithm).
    evalSubpackage({
      name: "@ar-agents/gde-tad",
      required: ["TAD_DOMICILIO_ADAPTER", "TAD_TRAMITES_ADAPTER"],
      alwaysOn: ["validate_igj_inscription"],
      toolCount: 4,
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
  lines.push(`  exposed tools: ${c("magenta", String(totalTools))}/133 (with current env)`);
  lines.push("");

  // GOVERNANCE: the art. 102 gate's exact blast radius under the current config.
  for (const line of fmtGovernance()) lines.push(line);

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
        "Partial coverage. The full @ar-agents/* surface is 133 tools — wire the " +
          "remaining subpackages for an end-to-end AR ops layer.",
      ),
    );
  }
  lines.push("");

  process.stdout.write(lines.join("\n") + "\n");
  // Exit 0 if at least one subpackage is enabled — disabled is informational, not a failure.
  return enabled === 0 && partial === 0 ? 0 : 0;
}
