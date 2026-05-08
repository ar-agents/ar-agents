import { runDoctor } from "./cli-doctor";

const HELP = `\
@ar-agents/facturacion CLI

Commands:
  doctor               Diagnose env (Node, AFIP cert/key/CUIT/env/PtoVta, peer deps, tools)
  help                 Print this message
  version              Print the installed package version

Environment:
  AFIP_CERT_PEM        Required — X.509 cert (PEM string).
  AFIP_KEY_PEM         Required — private key matching the cert.
  AFIP_CUIT            Required — CUIT registered with the cert.
  AFIP_ENV             "prod" (default) or "homo".
  AFIP_PTO_VTA         Default Punto de Venta (1–99999). Optional.

Docs: https://github.com/ar-agents/ar-agents/tree/main/packages/facturacion
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
    process.stdout.write(`@ar-agents/facturacion ${await readVersion()}\n`);
    return 0;
  }
  if (cmd === "doctor") return runDoctor();
  process.stderr.write(`Unknown command: ${cmd}\n\nRun \`facturacion help\` for usage.\n`);
  return 2;
}
