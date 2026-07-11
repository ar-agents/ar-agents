import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configFilePath, readConfig, resolveConfigDir, writeConfig } from "../src/config";

describe("resolveConfigDir", () => {
  it("honors AR_AGENTS_CONFIG_DIR when set", () => {
    const dir = resolveConfigDir({
      env: { AR_AGENTS_CONFIG_DIR: "/tmp/override-dir" },
      platform: "darwin",
      homedir: "/Users/someone",
    });
    expect(dir).toBe("/tmp/override-dir");
  });

  it("ignores an empty AR_AGENTS_CONFIG_DIR override", () => {
    const dir = resolveConfigDir({
      env: { AR_AGENTS_CONFIG_DIR: "" },
      platform: "darwin",
      homedir: "/Users/someone",
    });
    expect(dir).toBe(join("/Users/someone", "Library", "Application Support", "ar-agents"));
  });

  it("darwin: uses Library/Application Support", () => {
    const dir = resolveConfigDir({ env: {}, platform: "darwin", homedir: "/Users/someone" });
    expect(dir).toBe(join("/Users/someone", "Library", "Application Support", "ar-agents"));
  });

  it("win32: uses APPDATA when set", () => {
    const dir = resolveConfigDir({
      env: { APPDATA: "C:\\Users\\someone\\AppData\\Roaming" },
      platform: "win32",
      homedir: "C:\\Users\\someone",
    });
    expect(dir).toBe(join("C:\\Users\\someone\\AppData\\Roaming", "ar-agents"));
  });

  it("win32: falls back to homedir/AppData/Roaming without APPDATA", () => {
    const dir = resolveConfigDir({ env: {}, platform: "win32", homedir: "C:\\Users\\someone" });
    expect(dir).toBe(join("C:\\Users\\someone", "AppData", "Roaming", "ar-agents"));
  });

  it("linux: uses XDG_CONFIG_HOME when set", () => {
    const dir = resolveConfigDir({
      env: { XDG_CONFIG_HOME: "/home/someone/.config-custom" },
      platform: "linux",
      homedir: "/home/someone",
    });
    expect(dir).toBe(join("/home/someone/.config-custom", "ar-agents"));
  });

  it("linux: falls back to homedir/.config without XDG_CONFIG_HOME", () => {
    const dir = resolveConfigDir({ env: {}, platform: "linux", homedir: "/home/someone" });
    expect(dir).toBe(join("/home/someone", ".config", "ar-agents"));
  });
});

describe("readConfig / writeConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ar-agents-cli-config-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a config", () => {
    writeConfig(dir, { studioUrl: "https://studio.example", token: "stu_abc", accountId: "acc_1" });
    const read = readConfig(dir);
    expect(read).toEqual({ studioUrl: "https://studio.example", token: "stu_abc", accountId: "acc_1" });
  });

  it("writes the config file with 0600 perms", () => {
    writeConfig(dir, { studioUrl: "https://studio.example", token: "stu_abc" });
    const filePath = configFilePath(dir);
    expect(existsSync(filePath)).toBe(true);
    // Windows does not honor POSIX perms; only assert on platforms that do.
    if (process.platform !== "win32") {
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
    }
  });

  it("re-tightens perms when overwriting a pre-existing looser-perms file", () => {
    const filePath = configFilePath(dir);
    // Simulate a stale config left world-readable by an older version.
    writeFileSync(filePath, "{}", "utf-8");
    chmodSync(filePath, 0o644);
    writeConfig(dir, { studioUrl: "https://studio.example", token: "stu_abc" });
    if (process.platform !== "win32") {
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
    }
  });

  it("returns null for a missing config dir/file", () => {
    expect(readConfig(join(dir, "does-not-exist"))).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    writeFileSync(configFilePath(dir), "{ not valid json", "utf-8");
    expect(readConfig(dir)).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    writeFileSync(configFilePath(dir), JSON.stringify({ studioUrl: "https://x" }), "utf-8");
    expect(readConfig(dir)).toBeNull();
  });
});
