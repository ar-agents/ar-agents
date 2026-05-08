import { runDoctor } from "./cli-doctor";

const HELP = `\
@ar-agents/banking CLI

Commands:
  doctor               Diagnose env (Node, BCRA endpoints, peer deps, tool surface)
  help                 Print this message
  version              Print the installed package version

Environment:
  BCRA_DEUDORES_URL    Required for lookup_credit_situation. The 10 other tools
                       (4 algorithm-only + 6 BCRA Principales Variables) work
                       without it.

Docs: https://github.com/ar-agents/ar-agents/tree/main/packages/banking
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
    process.stdout.write(`@ar-agents/banking ${await readVersion()}\n`);
    return 0;
  }
  if (cmd === "doctor") return runDoctor();
  process.stderr.write(`Unknown command: ${cmd}\n\nRun \`banking help\` for usage.\n`);
  return 2;
}
