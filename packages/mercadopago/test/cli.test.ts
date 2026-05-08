/**
 * Smoke tests for the doctor CLI. Runs the actual subprocess against the
 * built binary so we exercise the same code path users hit. Avoids brittle
 * internal mocking — the env-presence + fetch behaviour is what we care
 * about, and Vitest can spin up subprocesses fine.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const BIN = fileURLToPath(new URL("../bin/mercadopago.js", import.meta.url));

beforeAll(() => {
  if (!existsSync(BIN)) {
    throw new Error(
      `bin not found at ${BIN}. Run \`pnpm build\` before running this test.`,
    );
  }
});

function run(
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [BIN, ...args], {
      env: { ...process.env, ...env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({ stdout, stderr, exitCode: code ?? 0 }),
    );
  });
}

describe("CLI — help and version", () => {
  it("`help` lists commands", async () => {
    const r = await run(["help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("doctor");
    expect(r.stdout).toContain("version");
    expect(r.stdout).toContain("Environment");
  });

  it("no args is the same as help", async () => {
    const r = await run([]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("doctor");
  });

  it("`--help` works as a flag", async () => {
    const r = await run(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("doctor");
  });

  it("`version` prints the package version", async () => {
    const r = await run(["version"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/^@ar-agents\/mercadopago \d+\.\d+\.\d+/);
  });

  it("unknown command exits 2 with a hint", async () => {
    const r = await run(["pizza"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("Unknown command: pizza");
    expect(r.stderr).toContain("mercadopago help");
  });
});

describe("CLI — doctor with no env", () => {
  it("flags missing MP_ACCESS_TOKEN as a fail and exits 1", async () => {
    const r = await run(["doctor"], {
      MP_ACCESS_TOKEN: "",
      NEXT_PUBLIC_BACK_URL: "",
      MP_WEBHOOK_SECRET: "",
    });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("MP_ACCESS_TOKEN not set");
    expect(r.stdout).toContain("Tools registered:");
  });

  it("warns when token has wrong prefix", async () => {
    const r = await run(["doctor"], {
      MP_ACCESS_TOKEN: "bogus-token-without-prefix",
      NEXT_PUBLIC_BACK_URL: "https://example.com/done",
      MP_WEBHOOK_SECRET: "1234567890abcdefghij1234567890ab",
    });
    // Will FAIL because the wrong-prefix check is a fail, but also because
    // the live probe will reject the bogus token. exit 1 is correct here.
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/MP_ACCESS_TOKEN has unexpected prefix|rejected by MP API/);
  });

  it("rejects http:// (non-HTTPS) NEXT_PUBLIC_BACK_URL", async () => {
    const r = await run(["doctor"], {
      MP_ACCESS_TOKEN: "TEST-bogus-but-present",
      NEXT_PUBLIC_BACK_URL: "http://localhost:3000/done",
      MP_WEBHOOK_SECRET: "1234567890abcdefghij1234567890ab",
    });
    expect(r.stdout).toContain("must be HTTPS");
  });

  it("warns on short webhook secret", async () => {
    const r = await run(["doctor"], {
      MP_ACCESS_TOKEN: "TEST-bogus-but-present",
      NEXT_PUBLIC_BACK_URL: "https://example.com/done",
      MP_WEBHOOK_SECRET: "short",
    });
    expect(r.stdout).toContain("suspiciously short");
  });

  it("lists tools, including HITL ops summary", async () => {
    const r = await run(["doctor"], {
      MP_ACCESS_TOKEN: "TEST-bogus",
      NEXT_PUBLIC_BACK_URL: "https://example.com/done",
      MP_WEBHOOK_SECRET: "1234567890abcdefghij1234567890ab",
    });
    expect(r.stdout).toContain("Tools registered:");
    expect(r.stdout).toContain("8 irreversible ops behind requireConfirmation()");
    expect(r.stdout).toContain("refund_payment");
  });
}, 30_000);
