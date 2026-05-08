/**
 * CLI dispatcher for `@ar-agents/whatsapp`. Subcommands:
 *
 *   whatsapp doctor    — diagnose env, ping Meta Graph, list tools
 *   whatsapp help      — print usage
 *   whatsapp version   — print installed version
 *
 * Exit codes: 0 = ok or warn-only, 1 = at least one fail.
 */

import { runDoctor } from "./cli-doctor";

const HELP = `\
@ar-agents/whatsapp CLI

Commands:
  doctor               Diagnose your environment (Node, token, phone-id, peer deps, tools)
  help                 Print this message
  version              Print the installed package version

Environment:
  WHATSAPP_ACCESS_TOKEN     Required — Meta System User access token (EAA…).
  WHATSAPP_PHONE_NUMBER_ID  Required — numeric phone-number-id from Meta.
  WHATSAPP_APP_SECRET       Required for verifyWebhookSignature() (32 hex chars).
  WHATSAPP_VERIFY_TOKEN     Required for the webhook subscription handshake.

Docs: https://github.com/ar-agents/ar-agents/tree/main/packages/whatsapp
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
    process.stdout.write(`@ar-agents/whatsapp ${await readVersion()}\n`);
    return 0;
  }

  if (cmd === "doctor") return runDoctor();

  process.stderr.write(`Unknown command: ${cmd}\n\nRun \`whatsapp help\` for usage.\n`);
  return 2;
}
