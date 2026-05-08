/**
 * CLI dispatcher for `@ar-agents/mercadopago`. Reads `argv[2]` (the first
 * arg after the bin name) and dispatches to the matching subcommand.
 *
 * Usage:
 *   mercadopago doctor             — diagnose your environment
 *   mercadopago doctor --probe     — also dry-call validate_tax_id
 *   mercadopago help               — print this list
 *
 * Exit codes follow the convention: 0 = ok or warn-only, 1 = at least one
 * fail; CI scripts can rely on `mercadopago doctor` to gate deploys.
 */

import { runDoctor } from "./cli-doctor";

const HELP = `\
@ar-agents/mercadopago CLI

Commands:
  doctor               Diagnose your environment (Node, token, peer deps, tools)
  doctor --probe       Same as doctor but also dry-calls validate_tax_id
  help                 Print this message
  version              Print the installed package version

Environment:
  MP_ACCESS_TOKEN      Required for any live calls. TEST- for sandbox, APP_USR- for prod.
  NEXT_PUBLIC_BACK_URL Required HTTPS URL for create_subscription / create_payment_preference.
  MP_WEBHOOK_SECRET    Required for verifyWebhookSignature.

Docs: https://github.com/ar-agents/ar-agents/tree/main/packages/mercadopago
`;

async function readVersion(): Promise<string> {
  // Bundled output lives at dist/cli.js, so package.json is one level up.
  // (Source path src/cli.ts is also one level up — keeping ../package.json
  // works for both.)
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
  const [, , cmd, ...rest] = argv;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    return 0;
  }

  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    process.stdout.write(`@ar-agents/mercadopago ${await readVersion()}\n`);
    return 0;
  }

  if (cmd === "doctor") {
    const probe = rest.includes("--probe");
    return runDoctor({ probe });
  }

  process.stderr.write(
    `Unknown command: ${cmd}\n\nRun \`mercadopago help\` for usage.\n`,
  );
  return 2;
}
