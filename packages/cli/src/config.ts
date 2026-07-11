// Local config for the `ar-agents` CLI: where the token lives on disk and
// how it is read/written. Mirrors the OS-native config-dir convention (macOS
// Application Support, Windows AppData\Roaming, XDG on everything else) so
// the file sits where users expect it, not in a home-dir dotfile.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CliConfig {
  studioUrl: string;
  token: string;
  accountId?: string;
}

/** Resolves the directory the CLI's config.json lives in. Honors
 *  `AR_AGENTS_CONFIG_DIR` first (tests + power users), then falls back to
 *  the platform convention. */
export function resolveConfigDir(opts: {
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  platform: NodeJS.Platform | string;
  homedir: string;
}): string {
  const override = opts.env.AR_AGENTS_CONFIG_DIR;
  if (typeof override === "string" && override.length > 0) {
    return override;
  }
  if (opts.platform === "darwin") {
    return join(opts.homedir, "Library", "Application Support", "ar-agents");
  }
  if (opts.platform === "win32") {
    const appData = opts.env.APPDATA;
    const base = typeof appData === "string" && appData.length > 0
      ? appData
      : join(opts.homedir, "AppData", "Roaming");
    return join(base, "ar-agents");
  }
  const xdgConfigHome = opts.env.XDG_CONFIG_HOME;
  const base = typeof xdgConfigHome === "string" && xdgConfigHome.length > 0
    ? xdgConfigHome
    : join(opts.homedir, ".config");
  return join(base, "ar-agents");
}

export function configFilePath(dir: string): string {
  return join(dir, "config.json");
}

/** Reads the persisted config, tolerating a missing directory/file and
 *  corrupt JSON (both return null rather than throwing). */
export function readConfig(dir: string): CliConfig | null {
  const filePath = configFilePath(dir);
  if (!existsSync(filePath)) return null;
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    typeof (parsed as Record<string, unknown>).studioUrl === "string" &&
    typeof (parsed as Record<string, unknown>).token === "string"
  ) {
    const candidate = parsed as Record<string, unknown>;
    const config: CliConfig = {
      studioUrl: candidate.studioUrl as string,
      token: candidate.token as string,
    };
    if (typeof candidate.accountId === "string") {
      config.accountId = candidate.accountId;
    }
    return config;
  }
  return null;
}

/** Persists the config. The token is sensitive (bearer credential), so the
 *  file is written with 0600 perms (owner read/write only). */
export function writeConfig(dir: string, config: CliConfig): void {
  mkdirSync(dir, { recursive: true });
  const filePath = configFilePath(dir);
  writeFileSync(filePath, JSON.stringify(config, null, 2), { mode: 0o600 });
  // writeFileSync's mode option only applies when the file is created, so an
  // overwrite of a pre-existing looser-perms file would keep the old perms.
  // chmod unconditionally to keep the token owner-only. Best-effort on the
  // platforms (Windows) where POSIX perms do not apply.
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // perms not enforceable on this platform; the file is still written
  }
}
