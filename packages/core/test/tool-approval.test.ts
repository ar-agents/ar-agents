import { describe, expect, it } from "vitest";
import { toolApprovalFromRisk } from "../src/tool-approval";

// toolApprovalFromRisk maps the risk manifest onto AI SDK 7's `toolApproval`
// generic-function form. It MUST agree with enforceRiskPolicy's classification:
// approval-level (money/fiscal/legal/irreversible) + unknown -> 'user-approval';
// read/create -> 'not-applicable'. Unknown FAILS CLOSED.

const call = (toolName: string) => ({ toolCall: { toolName } });

describe("toolApprovalFromRisk", () => {
  const approval = toolApprovalFromRisk();

  it("gates money-moving tools", () => {
    for (const name of ["transfer_funds", "create_payment", "withdraw", "treasury_offramp_convert"]) {
      expect(approval(call(name))).toBe("user-approval");
    }
  });

  it("gates fiscal / legal / irreversible acts", () => {
    expect(approval(call("emitir_factura"))).toBe("user-approval"); // fiscal
    expect(approval(call("incorporar_sociedad"))).toBe("user-approval"); // legal
    expect(approval(call("delete_account"))).toBe("user-approval"); // irreversible
  });

  it("lets read/create tools proceed", () => {
    for (const name of ["get_balance", "list_payments", "validar_cuit", "consultar_padron", "registrar_decision"]) {
      expect(approval(call(name))).toBe("not-applicable");
    }
  });

  it("FAILS CLOSED for unclassifiable names", () => {
    expect(approval(call("frobnicate_widget"))).toBe("user-approval");
    expect(approval(call(""))).toBe("user-approval");
  });

  it("never downgrades a mutation dressed as a read", () => {
    // set_balance / modificar_padron carry a read-ish noun but a mutating verb:
    // must NOT be 'not-applicable'.
    expect(approval(call("set_balance"))).toBe("user-approval");
    expect(approval(call("modificar_padron"))).toBe("user-approval");
  });

  it("honors sideEffectsFor (manifest hint sharpens classification)", () => {
    const withSe = toolApprovalFromRisk({
      sideEffectsFor: (n) => (n === "do_thing" ? "moves money" : undefined),
    });
    expect(withSe(call("do_thing"))).toBe("user-approval");
    // a 'none' side-effect on an otherwise-unknown name -> read -> proceed
    const pure = toolApprovalFromRisk({ sideEffectsFor: () => "none" });
    expect(pure(call("compute_quote"))).toBe("not-applicable");
  });

  it("honors descriptionFor (**IRREVERSIBLE** flag)", () => {
    const withDesc = toolApprovalFromRisk({
      descriptionFor: (n) => (n === "do_thing" ? "This is **IRREVERSIBLE**." : undefined),
    });
    expect(withDesc(call("do_thing"))).toBe("user-approval");
  });
});
