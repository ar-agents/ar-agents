// `ar-agents` CLI: `login` and `whoami` against the ar-agents studio
// (see apps/studio/src/app/api/account/route.ts). Fully offline-testable:
// every side effect (env, fetch, stdout/stderr, homedir, platform) is
// injected via `RunDeps`, nothing here reaches for a global.

import { createAccount, getAccount, AccountClientError } from "./account-client.js";
import { readConfig, resolveConfigDir, writeConfig } from "./config.js";

export const DEFAULT_STUDIO_URL = "https://studio-plum-three-47.vercel.app";

export interface RunDeps {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  stdout: { write(s: string): void } | NodeJS.WriteStream;
  stderr: { write(s: string): void } | NodeJS.WriteStream;
  homedir: string;
  platform: string;
  version: string;
}

const USAGE = `\
ar-agents: cliente de linea de comandos para el studio de ar-agents.

Uso:
  ar-agents login [--token <token>] [--url <url>]   Inicia sesion (o crea una cuenta anonima nueva)
  ar-agents whoami                                    Muestra la cuenta activa, uso y estado de la sociedad
  ar-agents help                                      Muestra esta ayuda
  ar-agents version                                    Muestra la version instalada

Variables de entorno:
  STUDIO_URL             URL base del studio (default: ${DEFAULT_STUDIO_URL})
  AR_AGENTS_CONFIG_DIR    Directorio donde se guarda la config local (uso interno/testing)
`;

function formatMicroUsd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg === "string" && arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (typeof value === "string" && !value.startsWith("--")) {
        flags[key] = value;
        i++;
      }
    }
  }
  return flags;
}

async function runLogin(argv: string[], deps: RunDeps): Promise<number> {
  const flags = parseFlags(argv);
  const baseUrl = flags.url ?? deps.env.STUDIO_URL ?? DEFAULT_STUDIO_URL;
  const configDir = resolveConfigDir(deps);

  try {
    if (flags.token) {
      const token = flags.token;
      const profile = await getAccount({ baseUrl, token, fetchImpl: deps.fetchImpl });
      writeConfig(configDir, { studioUrl: baseUrl, token, accountId: profile.accountId });
      deps.stdout.write(
        `Sesion iniciada. Cuenta ${profile.accountId} en ${baseUrl}.\n`,
      );
      return 0;
    }

    const created = await createAccount({ baseUrl, fetchImpl: deps.fetchImpl });
    writeConfig(configDir, { studioUrl: baseUrl, token: created.token, accountId: created.accountId });
    deps.stdout.write(
      `Cuenta anonima creada. Cuenta ${created.accountId} en ${baseUrl}.\n`,
    );
    return 0;
  } catch (err) {
    const message = err instanceof AccountClientError ? err.message : "error_desconocido";
    deps.stderr.write(`No se pudo iniciar sesion: ${message}\n`);
    return 1;
  }
}

async function runWhoami(deps: RunDeps): Promise<number> {
  const configDir = resolveConfigDir(deps);
  const config = readConfig(configDir);
  if (!config) {
    deps.stderr.write("No hay sesion. Corre: ar-agents login\n");
    return 1;
  }

  try {
    const profile = await getAccount({
      baseUrl: config.studioUrl,
      token: config.token,
      fetchImpl: deps.fetchImpl,
    });

    const lines = [
      `Cuenta: ${profile.accountId}`,
      `Creada: ${profile.createdAt}`,
      `Uso (${profile.usage.month}): ${profile.usage.inputTokens} tokens de entrada, ${profile.usage.outputTokens} tokens de salida, costo ${formatMicroUsd(profile.usage.costMicroUsd)}`,
      `Tope mensual restante: ${formatMicroUsd(profile.cap.remainingMicroUsd)} de ${formatMicroUsd(profile.cap.monthlyCostMicroUsd)}`,
    ];
    if (profile.society) {
      const estado = profile.society.suspended === true
        ? "suspendida"
        : profile.society.suspended === false
          ? "activa"
          : "estado desconocido";
      lines.push(`Sociedad: ${profile.society.denominacion} (${estado})`);
    } else {
      lines.push("Sociedad: ninguna constituida todavia");
    }

    deps.stdout.write(lines.join("\n") + "\n");
    return 0;
  } catch (err) {
    const message = err instanceof AccountClientError ? err.message : "error_desconocido";
    deps.stderr.write(`No se pudo consultar la cuenta: ${message}\n`);
    return 1;
  }
}

export async function run(argv: string[], deps: RunDeps): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    deps.stdout.write(USAGE);
    return 0;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    deps.stdout.write(`@ar-agents/cli ${deps.version}\n`);
    return 0;
  }

  if (command === "login") {
    return runLogin(rest, deps);
  }

  if (command === "whoami") {
    return runWhoami(deps);
  }

  deps.stderr.write(`Comando desconocido: ${command}\n`);
  deps.stderr.write(USAGE);
  return 1;
}
