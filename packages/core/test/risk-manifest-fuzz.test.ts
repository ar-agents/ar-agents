import { describe, expect, it } from "vitest";
import { classifyTool, requiresApproval } from "../src/risk-manifest";

// Adversarial fuzz: an attacker controls the tool NAME (a third-party MCP server
// registers tools, or a generated agent names its own). These properties must
// hold for ANY name, so the central gate cannot be talked out of gating a
// dangerous act by dressing its name up to look like a read. The key structural
// guarantee under test: critical-pattern OVERRIDES are checked BEFORE the
// benign read-name heuristic, so a read-ish affix can never downgrade a gated
// tool; anything unrecognized fails closed.

const GATED_STEMS = [
  "transfer_funds",
  "create_payment",
  "emitir_factura",
  "incorporar_sociedad",
  "delete_account",
  "revoke_token",
  "withdraw",
  "uala_create_payout",
  "submit_ddjj",
  "fecred_accept_invoice",
];

const READ_PREFIXES = ["get_", "list_", "consultar_", "info_", "status_", "preview_", "fetch_", "is_"];
const READ_SUFFIXES = ["_status", "_info", "_preview", "_balance", "_lookup"];

describe("risk-manifest adversarial fuzz", () => {
  it("a gated stem stays gated under any read-ish prefix", () => {
    const escaped: string[] = [];
    for (const stem of GATED_STEMS) {
      for (const pre of READ_PREFIXES) {
        const name = `${pre}${stem}`;
        if (!requiresApproval({ name })) escaped.push(name);
      }
    }
    expect(escaped, `a read-ish prefix downgraded a gated tool:\n${escaped.join("\n")}`).toEqual([]);
  });

  it("a gated stem stays gated under any read-ish suffix", () => {
    const escaped: string[] = [];
    for (const stem of GATED_STEMS) {
      for (const suf of READ_SUFFIXES) {
        const name = `${stem}${suf}`;
        if (!requiresApproval({ name })) escaped.push(name);
      }
    }
    expect(escaped, `a read-ish suffix downgraded a gated tool:\n${escaped.join("\n")}`).toEqual([]);
  });

  it("uppercase and hyphen-separated variants still require approval", () => {
    for (const stem of GATED_STEMS) {
      const base = classifyTool({ name: stem });
      expect(base).not.toBe("read");
      expect(base).not.toBe("create");
      expect(requiresApproval({ name: stem.toUpperCase() })).toBe(true);
      // some transports normalize _ <-> -; the act must not become auto-runnable
      expect(requiresApproval({ name: stem.replace(/_/g, "-") })).toBe(true);
    }
  });

  it("a description **IRREVERSIBLE** flag gates an otherwise read-looking name", () => {
    expect(
      requiresApproval({
        name: "get_thing",
        description: "Returns the thing. **IRREVERSIBLE** once called.",
      }),
    ).toBe(true);
  });

  it("gibberish / unmatched names FAIL CLOSED (unknown -> approval)", () => {
    for (const name of ["frobnicate", "xyzzy_42", "wkpf_zqx", "blorp_thing", "qux_grault"]) {
      expect(classifyTool({ name })).toBe("unknown");
      expect(requiresApproval({ name })).toBe(true);
    }
  });

  it("a genuine read is NOT gated (the gate is not trivially everything)", () => {
    // sanity counterweight: prove the suite would catch an over-gating regression
    for (const name of ["get_balance", "list_invoices", "validate_cuit", "consultar_padron"]) {
      expect(requiresApproval({ name })).toBe(false);
    }
  });
});
