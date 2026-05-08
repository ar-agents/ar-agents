import { runDoctor } from "./cli-doctor";

const HELP = `\
@ar-agents/shipping CLI

Commands:
  doctor               Diagnose carriers (Andreani / OCA / Correo Argentino)
  help                 Print this message
  version              Print the installed package version

Environment:
  ANDREANI_CLIENT_ID         Andreani OAuth (optional).
  ANDREANI_CLIENT_SECRET     Andreani OAuth (optional).
  ANDREANI_CONTRACT          Andreani contract number (optional).
  OCA_USUARIO                OCA Tarifador credentials (optional).
  OCA_PASSWORD               OCA Tarifador credentials (optional).
  OCA_CUIT                   OCA CUIT (optional).
  OCA_OPERATIVA              OCA operativa code (optional).
  CORREO_API_KEY             Correo Argentino API key (optional).

Docs: https://github.com/ar-agents/ar-agents/tree/main/packages/shipping
`;

async function readVersion(): Promise<string> {
  for (const rel of ["../package.json", "../../package.json"]) {
    try {
      const url = new URL(rel, import.meta.url);
      const fs = await import("node:fs/promises");
      const pkg = JSON.parse(await fs.readFile(url, "utf-8")) as { version?: string };
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
    process.stdout.write(`@ar-agents/shipping ${await readVersion()}\n`);
    return 0;
  }
  if (cmd === "doctor") return runDoctor();
  process.stderr.write(`Unknown command: ${cmd}\n\nRun \`shipping help\` for usage.\n`);
  return 2;
}
