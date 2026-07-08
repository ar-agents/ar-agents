import { describe, expect, it } from "vitest";
import {
  CAP_MESSAGE,
  NETWORK_MESSAGE,
  NO_MODEL_MESSAGE,
  PROVIDER_NO_CREDIT_MESSAGE,
  PROVIDER_SATURATED_MESSAGE,
  UNKNOWN_MESSAGE,
  describeAgentError,
} from "../src/lib/ui/agent-error";

describe("describeAgentError", () => {
  it("returns null when there is no error", () => {
    expect(describeAgentError(null)).toBeNull();
    expect(describeAgentError(undefined)).toBeNull();
  });

  it("maps the 402 cap error body to the cap message", () => {
    const error = new Error(JSON.stringify({ ok: false, error: "cap" }));
    expect(describeAgentError(error)).toEqual({ kind: "cap", message: CAP_MESSAGE });
  });

  it("maps the 503 no_model_configured error body to the setup message", () => {
    const error = new Error(JSON.stringify({ ok: false, error: "no_model_configured" }));
    expect(describeAgentError(error)).toEqual({
      kind: "no_model_configured",
      message: NO_MODEL_MESSAGE,
    });
  });

  it("maps an unrecognized JSON error code to the generic unknown message", () => {
    const error = new Error(JSON.stringify({ ok: false, error: "rate_limited" }));
    expect(describeAgentError(error)).toEqual({ kind: "unknown", message: UNKNOWN_MESSAGE });
  });

  it("maps a non-JSON error message (network-level failure) to the network message", () => {
    const error = new Error("Failed to fetch");
    expect(describeAgentError(error)).toEqual({ kind: "network", message: NETWORK_MESSAGE });
  });

  it("maps an empty error message to the network message", () => {
    const error = new Error("");
    expect(describeAgentError(error)).toEqual({ kind: "network", message: NETWORK_MESSAGE });
  });

  it("handles a non-Error thrown value", () => {
    expect(describeAgentError("boom")).toEqual({ kind: "network", message: NETWORK_MESSAGE });
  });

  it("maps the mid-stream provider-credit code to its message", () => {
    expect(describeAgentError(new Error("proveedor_sin_credito"))).toEqual({
      kind: "provider_no_credit",
      message: PROVIDER_NO_CREDIT_MESSAGE,
    });
  });

  it("maps the mid-stream provider-saturated code to its message", () => {
    expect(describeAgentError(new Error("proveedor_saturado"))).toEqual({
      kind: "provider_saturated",
      message: PROVIDER_SATURATED_MESSAGE,
    });
  });

  it("maps the mid-stream agent_failed code to the unknown message", () => {
    expect(describeAgentError(new Error("agent_failed"))).toEqual({
      kind: "unknown",
      message: UNKNOWN_MESSAGE,
    });
  });
});
