// `ar-agents` CLI: `login` and `whoami` against the ar-agents studio's
// account API (see apps/studio/src/app/api/account/route.ts), and `chat`
// against its agent API (see apps/studio/src/app/api/agent/route.ts). Fully
// offline-testable: every side effect (env, fetch, stdout/stderr, homedir,
// platform, stdin) is injected via `RunDeps`, nothing here reaches for a
// global. `chat`'s interactive readline loop is the one exception that
// needs a real TTY to run end to end; the turn logic it wraps
// (`runChatTurn`) is exported and unit-tested without one.

import { readFileSync } from "node:fs";
import { createAccount, getAccount, AccountClientError } from "./account-client.js";
import { sendAgentTurn, AgentClientError } from "./agent-client.js";
import { constituteSociety, ConstituteClientError } from "./constitute-client.js";
import {
  getSociety,
  getSocietyActivity,
  setSocietySuspended,
  SocietyClientError,
  type SocietyAuditEntry,
} from "./society-client.js";
import { readConfig, resolveConfigDir, writeConfig } from "./config.js";
import { appendAssistantTurn, appendUserTurn, type ToolPart, type UiMessage } from "./messages.js";

export const DEFAULT_STUDIO_URL = "https://studio-plum-three-47.vercel.app";

export interface RunDeps {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  stdout: { write(s: string): void } | NodeJS.WriteStream;
  stderr: { write(s: string): void } | NodeJS.WriteStream;
  homedir: string;
  platform: string;
  version: string;
  /** Optional: only needed by `chat`'s interactive loop. When absent, `chat`
   *  prints a short message instead of blocking on a TTY that isn't there
   *  (keeps unit tests from hanging). */
  stdin?: NodeJS.ReadableStream;
}

const USAGE = `\
ar-agents: cliente de linea de comandos para el studio de ar-agents.

Uso:
  ar-agents login [--token <token>] [--url <url>]   Inicia sesion (o crea una cuenta anonima nueva)
  ar-agents whoami                                    Muestra la cuenta activa, uso y estado de la sociedad
  ar-agents chat                                      Charla con el coach de ar-agents (requiere sesion iniciada)
  ar-agents constitute --draft <archivo> --nombre <nombre> --cuit <cuit> --acepta-102 [--url <url>]
                                                       Constituye la sociedad a partir del borrador (requiere sesion iniciada)
  ar-agents society [--url <url>]                     Muestra el resumen de tu sociedad (requiere sesion iniciada)
  ar-agents activity [--url <url>]                    Muestra el tablero en vivo: deploy, clientes, kill switch,
                                                       aprobaciones pendientes y acciones recientes (requiere sesion iniciada)
  ar-agents suspend [--motivo <texto>] --confirmar [--url <url>]
                                                       Suspende la sociedad (kill switch, requiere confirmacion explicita)
  ar-agents resume --confirmar [--url <url>]          Reanuda la sociedad suspendida (requiere confirmacion explicita)
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

/** Renders a tool-output event as a short, defensive status line. Never
 *  throws on an unexpected output shape (the model's tools are free-form
 *  from the CLI's point of view). */
function formatToolLine(name: string | null, output: unknown): string {
  if (name === "preview_society") {
    const draft =
      output && typeof output === "object" && "draft" in output
        ? (output as { draft?: unknown }).draft
        : undefined;
    const denominacion =
      draft && typeof draft === "object" && "denominacion" in draft
        ? (draft as { denominacion?: unknown }).denominacion
        : undefined;
    if (typeof denominacion === "string") {
      return `\n[preview_society] borrador: ${denominacion}\n`;
    }
  }
  return `\n[${name ?? "tool"}]\n`;
}

/** One request/response turn of `chat`: appends the user's text to the
 *  history, streams the reply to `stdout` incrementally, and returns the
 *  history with both the user and assistant turns appended. Offline-testable
 *  (no readline, no real stdin) so this is the part unit tests exercise; the
 *  interactive loop around it is thin and exercised live (M1-4e). */
export async function runChatTurn(opts: {
  baseUrl: string;
  token: string;
  history: UiMessage[];
  userText: string;
  fetchImpl: typeof fetch;
  stdout: { write(s: string): void };
}): Promise<{ history: UiMessage[]; error: string | null }> {
  const withUser = appendUserTurn(opts.history, opts.userText);

  let error: string | null = null;
  let text = "";
  let toolParts: ToolPart[] = [];
  try {
    const result = await sendAgentTurn({
      baseUrl: opts.baseUrl,
      token: opts.token,
      messages: withUser,
      fetchImpl: opts.fetchImpl,
      onText: (delta) => {
        opts.stdout.write(delta);
      },
      onTool: (name, output) => {
        opts.stdout.write(formatToolLine(name, output));
      },
    });
    text = result.text;
    error = result.error;
    toolParts = result.toolParts;
  } catch (err) {
    error = err instanceof AgentClientError ? err.message : "error_desconocido";
  }

  if (error) {
    opts.stdout.write(`\n[error] ${error}\n`);
    // A failed turn leaves nothing durable. Appending an empty assistant part
    // here would poison the next request: the studio accepts an empty text
    // part, but the model provider rejects an empty text block, which would
    // brick the rest of the session. Drop the whole turn so the user retries
    // from a clean, valid history.
    return { history: opts.history, error };
  }

  opts.stdout.write("\n");

  if (text.length === 0 && toolParts.length === 0) {
    // Stream succeeded but produced nothing at all (no text, no completed
    // tool call). An assistant message needs at least one part, so there is
    // nothing valid to persist. Drop the turn to keep history valid.
    return { history: opts.history, error: null };
  }

  // Tool parts are now persisted (M1-4g): a tool-only turn (empty text, one
  // or more resolved tool calls, for example a `preview_society` draft) is
  // no longer dropped. It is appended as an assistant message whose parts
  // are just the tool parts, so the next turn still carries the draft.
  return { history: appendAssistantTurn(withUser, text, toolParts), error: null };
}

async function runChat(deps: RunDeps): Promise<number> {
  const configDir = resolveConfigDir(deps);
  const config = readConfig(configDir);
  if (!config) {
    deps.stderr.write("No hay sesion. Corre: ar-agents login\n");
    return 1;
  }

  if (!deps.stdin) {
    deps.stdout.write("ar-agents chat necesita una terminal interactiva (stdin no disponible).\n");
    return 0;
  }

  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: deps.stdin, output: deps.stdout as NodeJS.WriteStream });

  let history: UiMessage[] = [];

  // Exactly one persistent close listener (not one per turn): on stream end it
  // resolves whatever question is currently in flight with null so the loop
  // exits. Registering the listener inside askLine would leak one listener per
  // turn and trip MaxListenersExceededWarning after ~10 turns.
  let pendingResolve: ((value: string | null) => void) | null = null;
  let closed = false;
  rl.on("close", () => {
    closed = true;
    if (pendingResolve) {
      pendingResolve(null);
      pendingResolve = null;
    }
  });

  const askLine = (): Promise<string | null> =>
    new Promise((resolvePromise) => {
      // With piped stdin (a scripted journey), EOF can close the interface
      // while a chat turn is streaming; the next rl.question() then throws
      // ERR_USE_AFTER_CLOSE ("readline was closed"). Resolve null instead so
      // the loop ends the same way as an interactive Ctrl-D.
      if (closed) {
        resolvePromise(null);
        return;
      }
      pendingResolve = resolvePromise;
      try {
        rl.question("> ", (line) => {
          pendingResolve = null;
          resolvePromise(line);
        });
      } catch {
        pendingResolve = null;
        resolvePromise(null);
      }
    });

  for (;;) {
    const line = await askLine();
    if (line === null) break;
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed === "salir" || trimmed === "exit") break;

    const turn = await runChatTurn({
      baseUrl: config.studioUrl,
      token: config.token,
      history,
      userText: trimmed,
      fetchImpl: deps.fetchImpl,
      stdout: deps.stdout,
    });
    history = turn.history;
  }

  rl.close();
  return 0;
}

/** `ar-agents constitute`: takes the draft surfaced by `chat`'s
 *  `preview_society` tool, collects administrador nombre and cuit plus an
 *  explicit `--acepta-102` confirmation, and POSTs it to
 *  /api/society/constitute. This is irreversible, so the confirmation gate
 *  runs before anything else in this function, including reading the draft
 *  file: no confirmation, no fetch. */
async function runConstitute(argv: string[], deps: RunDeps): Promise<number> {
  const configDir = resolveConfigDir(deps);
  const config = readConfig(configDir);
  if (!config) {
    deps.stderr.write("No hay sesion. Corre: ar-agents login\n");
    return 1;
  }

  const acepta102 = argv.includes("--acepta-102");
  if (!acepta102) {
    deps.stderr.write(
      "Constituir una sociedad es irreversible. Tenes que aceptar la responsabilidad como " +
        "administrador (art. 102) de forma explicita.\n" +
        "Volve a correr el comando agregando --acepta-102 cuando estes de acuerdo.\n",
    );
    return 1;
  }

  const flags = parseFlags(argv);
  if (!flags.draft || !flags.nombre || !flags.cuit) {
    deps.stderr.write(
      "Uso: ar-agents constitute --draft <archivo> --nombre <nombre> --cuit <cuit> --acepta-102 [--url <url>]\n",
    );
    return 1;
  }

  let draft: unknown;
  try {
    const raw = readFileSync(flags.draft, "utf-8");
    draft = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "error_desconocido";
    deps.stderr.write(`No se pudo leer el borrador: ${message}\n`);
    return 1;
  }

  // Target the studio this session was minted against (like whoami and chat),
  // not the production default: the token is scoped to that host. `--url`
  // stays available as an explicit override.
  const baseUrl = flags.url ?? config.studioUrl;

  try {
    const result = await constituteSociety({
      baseUrl,
      token: config.token,
      draft,
      administrador: { nombre: flags.nombre, cuit: flags.cuit },
      fetchImpl: deps.fetchImpl,
    });

    const denominacion = result.society.denominacion ?? "(sin nombre)";
    deps.stdout.write(
      [
        `Sociedad constituida: ${denominacion}`,
        `adminToken: ${result.credentials.adminToken}`,
        `gateToken: ${result.credentials.gateToken}`,
        "",
        "Guarda estas credenciales ahora. No se muestran de nuevo y no se pueden recuperar.",
      ].join("\n") + "\n",
    );
    return 0;
  } catch (err) {
    if (err instanceof ConstituteClientError && err.code === "ya_tiene_sociedad") {
      deps.stderr.write("Esta cuenta ya tiene una sociedad constituida.\n");
      return 1;
    }
    const message = err instanceof ConstituteClientError ? err.message : "error_desconocido";
    deps.stderr.write(`No se pudo constituir la sociedad: ${message}\n`);
    return 1;
  }
}

const NO_SOCIETY_HINT = "No hay ninguna sociedad constituida todavia. Constituila con: ar-agents constitute\n";

/** `ar-agents society`: GET /api/society, rendered as a readable es-AR
 *  summary block. */
async function runSociety(argv: string[], deps: RunDeps): Promise<number> {
  const configDir = resolveConfigDir(deps);
  const config = readConfig(configDir);
  if (!config) {
    deps.stderr.write("No hay sesion. Corre: ar-agents login\n");
    return 1;
  }

  const flags = parseFlags(argv);
  const baseUrl = flags.url ?? config.studioUrl;

  try {
    const { society } = await getSociety({ baseUrl, token: config.token, fetchImpl: deps.fetchImpl });

    if (!society) {
      deps.stdout.write(NO_SOCIETY_HINT);
      return 0;
    }

    const estado = society.suspended === true
      ? "suspendida"
      : society.suspended === false
        ? "activa"
        : "estado desconocido";

    const lines = [
      `Sociedad: ${society.denominacion}`,
      `Tipo: ${society.tipo}`,
      `Registro: ${society.registryId ?? "sin registrar"}`,
      `Creada: ${society.createdAt}`,
      `Estado: ${estado}`,
    ];

    if (society.goodStanding) {
      const score = society.goodStanding.score === null ? "sin dato" : String(society.goodStanding.score);
      const rating = society.goodStanding.rating ?? "sin dato";
      lines.push(`Buen estandar: ${society.goodStanding.state} (score ${score}, rating ${rating})`);
    } else {
      lines.push("Buen estandar: sin datos");
    }

    lines.push(
      `Aprobaciones pendientes: ${society.pendingApprovals === null ? "sin datos" : society.pendingApprovals}`,
    );

    if (society.deploy) {
      lines.push(`Deploy: ${society.deploy.projectName} (${society.deploy.url})`);
    } else {
      lines.push("Deploy: sin desplegar todavia");
    }

    deps.stdout.write(lines.join("\n") + "\n");
    return 0;
  } catch (err) {
    const message = err instanceof SocietyClientError ? err.message : "error_desconocido";
    deps.stderr.write(`No se pudo consultar la sociedad: ${message}\n`);
    return 1;
  }
}

/** Renders one recent-actions line for `activity`: `ts  tool  (governance)`,
 *  with an `[error]` marker and an optional short summary. Kept defensive:
 *  never throws on a missing field. */
function formatAuditLine(entry: SocietyAuditEntry): string {
  const errored = entry.errored ? " [error]" : "";
  const summary = entry.summary ? ` ${entry.summary}` : "";
  return `  ${entry.ts}  ${entry.tool}  (${entry.governance})${errored}${summary}`;
}

/** `ar-agents activity`: GET /api/society/activity, rendered as the "sociedad
 *  en vivo" cockpit: deploy health, client wiring, kill switch, pending
 *  approvals, and recent audited actions. Each section prints "sin datos
 *  todavia" independently when its `available` flag is false, mirroring the
 *  route's own independent-failure design. */
async function runActivity(argv: string[], deps: RunDeps): Promise<number> {
  const configDir = resolveConfigDir(deps);
  const config = readConfig(configDir);
  if (!config) {
    deps.stderr.write("No hay sesion. Corre: ar-agents login\n");
    return 1;
  }

  const flags = parseFlags(argv);
  const baseUrl = flags.url ?? config.studioUrl;

  try {
    const activity = await getSocietyActivity({ baseUrl, token: config.token, fetchImpl: deps.fetchImpl });

    const lines: string[] = [];

    if (activity.deploy.available) {
      lines.push(`Deploy: ${activity.deploy.state ?? "sin estado"} (${activity.deploy.url ?? "sin url"})`);
    } else {
      lines.push("Deploy: sin datos todavia");
    }

    lines.push("Clientes:");
    if (activity.clients.available && activity.clients.statuses) {
      for (const [cliente, estado] of Object.entries(activity.clients.statuses)) {
        lines.push(`  ${cliente}: ${estado}`);
      }
    } else {
      lines.push("  sin datos todavia");
    }

    if (activity.killSwitch.available) {
      const estado = activity.killSwitch.suspended === true
        ? "suspendida"
        : activity.killSwitch.suspended === false
          ? "activa"
          : "sin datos";
      lines.push(`Kill switch: ${estado}`);
    } else {
      lines.push("Kill switch: sin datos todavia");
    }

    if (activity.approvals.available) {
      const count = activity.approvals.pendingCount ?? 0;
      lines.push(`Aprobaciones pendientes: ${count}`);
      if (activity.approvals.items && activity.approvals.items.length > 0) {
        for (const item of activity.approvals.items) {
          lines.push(`  ${item.tool} (${item.status})`);
        }
      }
    } else {
      lines.push("Aprobaciones pendientes: sin datos todavia");
    }

    lines.push("Acciones recientes:");
    if (activity.audit.available && activity.audit.entries && activity.audit.entries.length > 0) {
      for (const entry of activity.audit.entries) {
        lines.push(formatAuditLine(entry));
      }
    } else {
      lines.push("  sin datos todavia");
    }

    deps.stdout.write(lines.join("\n") + "\n");
    return 0;
  } catch (err) {
    if (err instanceof SocietyClientError && err.code === "sin_sociedad") {
      deps.stderr.write(NO_SOCIETY_HINT);
      return 1;
    }
    const message = err instanceof SocietyClientError ? err.message : "error_desconocido";
    deps.stderr.write(`No se pudo consultar la actividad de la sociedad: ${message}\n`);
    return 1;
  }
}

/** Shared handler for `ar-agents suspend` and `ar-agents resume`: the kill
 *  switch. This is a consequential, reversible-but-disruptive action (it
 *  cuts the society's own agent app off), so the confirmation gate runs
 *  before anything else, including reading any flags beyond `--confirmar`
 *  itself: no confirmation, no fetch (mirrors runConstitute's
 *  `--acepta-102` gate exactly). */
async function runSuspend(argv: string[], deps: RunDeps, suspend: boolean): Promise<number> {
  const configDir = resolveConfigDir(deps);
  const config = readConfig(configDir);
  if (!config) {
    deps.stderr.write("No hay sesion. Corre: ar-agents login\n");
    return 1;
  }

  const confirmado = argv.includes("--confirmar");
  if (!confirmado) {
    const accion = suspend ? "Suspender" : "Reanudar";
    const gerundio = suspend ? "suspendiendo" : "reanudando";
    deps.stderr.write(
      `${accion} la sociedad afecta su operacion en vivo. Tenes que confirmarlo de forma explicita.\n` +
        `Volve a correr el comando agregando --confirmar cuando estes ${gerundio} con intencion.\n`,
    );
    return 1;
  }

  const flags = parseFlags(argv);
  const baseUrl = flags.url ?? config.studioUrl;

  try {
    const result = await setSocietySuspended({
      baseUrl,
      token: config.token,
      suspend,
      ...(flags.motivo !== undefined ? { motivo: flags.motivo } : {}),
      fetchImpl: deps.fetchImpl,
    });

    const estado = result.suspended === true
      ? "suspendida"
      : result.suspended === false
        ? "activa"
        : "estado desconocido";
    const mensaje = suspend ? "Sociedad suspendida." : "Sociedad reanudada.";
    deps.stdout.write(`${mensaje} Estado: ${estado}\n`);
    return 0;
  } catch (err) {
    if (err instanceof SocietyClientError && err.code === "sin_sociedad") {
      deps.stderr.write(NO_SOCIETY_HINT);
      return 1;
    }
    const message = err instanceof SocietyClientError ? err.message : "error_desconocido";
    const accion = suspend ? "suspender" : "reanudar";
    deps.stderr.write(`No se pudo ${accion} la sociedad: ${message}\n`);
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

  if (command === "chat") {
    return runChat(deps);
  }

  if (command === "constitute") {
    return runConstitute(rest, deps);
  }

  if (command === "society") {
    return runSociety(rest, deps);
  }

  if (command === "activity") {
    return runActivity(rest, deps);
  }

  if (command === "suspend") {
    return runSuspend(rest, deps, true);
  }

  if (command === "resume") {
    return runSuspend(rest, deps, false);
  }

  deps.stderr.write(`Comando desconocido: ${command}\n`);
  deps.stderr.write(USAGE);
  return 1;
}
