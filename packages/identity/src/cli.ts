/**
 * CLI dispatcher for `@ar-agents/identity`. Subcommands:
 *
 *   identity doctor    — diagnose env, validate CUIT, check cert/key PEMs
 *   identity help      — print usage
 *   identity version   — print installed version
 */

import { runDoctor } from "./cli-doctor";

const HELP = `\
@ar-agents/identity CLI

Commands:
  doctor               Diagnose your environment (Node, AFIP creds, peer deps, tools)
  help                 Print this message
  version              Print the installed package version

Environment:
  AFIP_CUIT            Required for lookup_cuit_afip — the CUIT registered with the cert.
  AFIP_CERT_PEM        Required for lookup_cuit_afip — X.509 cert (PEM string).
  AFIP_KEY_PEM         Required for lookup_cuit_afip — private key (PEM string).
  AFIP_ENV             "prod" (default) or "homo" — switches WSAA endpoints.

Docs: https://github.com/ar-agents/ar-agents/tree/main/packages/identity
`;

async function readVersion(): Promise<string> {
  for (const rel of ["../package.json", "../../package.json"]) {
    try {
      const url = new URL(rel, import.meta.url);
      const fs = await import("node:fs/promises");
      const text = await fs.readFile(url, "utf-8");
      const pkg = JSON.parse(text) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try next
    }
  }
  return "unknown";
}

export async function runCli(argv: string[]): Promise<number> {
  const [, , cmd] = argv;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    return 0;
  }
  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    process.stdout.write(`@ar-agents/identity ${await readVersion()}\n`);
    return 0;
  }
  if (cmd === "doctor") return runDoctor();

  process.stderr.write(`Unknown command: ${cmd}\n\nRun \`identity help\` for usage.\n`);
  return 2;
}
