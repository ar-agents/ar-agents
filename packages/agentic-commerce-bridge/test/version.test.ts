import { describe, it, expect } from "vitest";
import { negotiateVersion } from "../src/version";

describe("negotiateVersion", () => {
  it("accepts the latest supported version", () => {
    const r = negotiateVersion("2026-04-17");
    if ("version" in r) {
      expect(r.version).toBe("2026-04-17");
      expect(r.isLegacy).toBe(false);
    } else {
      throw new Error("expected version");
    }
  });

  it("flags legacy versions", () => {
    const r = negotiateVersion("2025-09-29");
    if ("version" in r) {
      expect(r.version).toBe("2025-09-29");
      expect(r.isLegacy).toBe(true);
    } else {
      throw new Error("expected version");
    }
  });

  it("returns missing_api_version when header absent and no default", () => {
    const r = negotiateVersion(undefined);
    expect("code" in r && r.code).toBe("missing_api_version");
  });

  it("falls back to defaultVersion when header absent and default provided", () => {
    const r = negotiateVersion(undefined, { defaultVersion: "2026-04-17" });
    if ("version" in r) {
      expect(r.version).toBe("2026-04-17");
    } else {
      throw new Error("expected version");
    }
  });

  it("returns unsupported_api_version with supported_versions echo", () => {
    const r = negotiateVersion("1999-01-01");
    if ("code" in r) {
      expect(r.code).toBe("unsupported_api_version");
      expect(r.supported_versions).toEqual(
        expect.arrayContaining(["2026-04-17"]),
      );
    } else {
      throw new Error("expected error");
    }
  });

  it("trims whitespace from header", () => {
    const r = negotiateVersion("  2026-04-17  ");
    if ("version" in r) {
      expect(r.version).toBe("2026-04-17");
    } else {
      throw new Error("expected version");
    }
  });

  it("respects custom supported list", () => {
    const r = negotiateVersion("2027-01-01", {
      supported: ["2027-01-01"],
    });
    if ("version" in r) {
      expect(r.version).toBe("2027-01-01");
    } else {
      throw new Error("expected version");
    }
  });
});
