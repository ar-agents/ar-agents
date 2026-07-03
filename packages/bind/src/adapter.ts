/**
 * BIND APIBANK adapter contract.
 *
 * The adapter pattern keeps `@ar-agents/bind` testable without network +
 * lets downstream callers swap real, sandbox, or mock implementations
 * without changing the tool layer. Two concrete adapters:
 *
 *   UnconfiguredBindAdapter  resolves a structured `{ ok: false,
 *                            code: "unconfigured" }` result on every
 *                            call. Never throws. Default, so tools stay
 *                            LLM-safe before BIND onboarding lands.
 *   HttpBindAdapter          real-network adapter for BIND APIBANK
 *                            (Banco Industrial BaaS). JWT login +
 *                            transparent refresh; one method per
 *                            operation. Defaults to the public sandbox.
 *
 * Endpoint paths and the auth flow are VERIFIED against the public
 * apidoc (sandbox.bind.com.ar/apidoc, APIBank SandBox v1.7.15):
 *
 *   POST /login/jwt                          {username,password} -> {token, expires_in}
 *   Authorization: JWT <token>               (literal "JWT" scheme, not Bearer)
 *   GET  /banks/:bank_id/accounts/:view_id   accounts list
 *   GET  .../:account_id/:view_id/transactions   movements (obp_* headers)
 *   GET  /accounts/cbu/:cbu_cvu              ownership by CBU/CVU
 *   GET  /accounts/alias/:alias              ownership by alias
 *   POST .../transaction-request-types/TRANSFER/transaction-requests
 *   POST .../transaction-request-types/DEBIN/transaction-requests
 *   GET  .../transaction-request-types/CHECK echeq listing (obp_status header)
 *
 * The production base URL is NOT published openly; BIND hands it over
 * during commercial onboarding (mTLS client certificate involved).
 * Default base URL here is the sandbox. Override `baseUrl` once onboarded.
 */
import type {
  BindAccount,
  BindMovement,
  BindTransferRequest,
  BindTransferResult,
  BindDebinRequest,
  BindDebinResult,
  BindEcheq,
  CbuOwnership,
  GetCbuOwnerArgs,
  GetMovementsArgs,
  GetEcheqsArgs,
  BindResult,
} from "./types";
import {
  bindErr,
  bindOk,
  bindAccountSchema,
  bindMovementSchema,
  cbuOwnershipSchema,
  bindTransferResultSchema,
  bindDebinResultSchema,
  bindEcheqSchema,
} from "./types";
import { BindApiError, BindAuthError, BindValidationError } from "./errors";
import {
  ArAgentsAuthError,
  ArAgentsProtocolError,
  ArAgentsRateLimitError,
  ArAgentsResponseValidationError,
  HttpClient,
  type HttpMethod,
  type ResponseSchema,
} from "@ar-agents/core";
import { z } from "zod";

/** POST /login/jwt → { token, expires_in }. Validated so a malformed login
 * body can't yield an undefined token. */
const loginSchema = z.object({
  token: z.string(),
  expires_in: z.number().optional(),
});

const bindAccountsSchema = z.array(bindAccountSchema);
const bindMovementsSchema = z.array(bindMovementSchema);
const bindEcheqsSchema = z.array(bindEcheqSchema);

/** Map a core transport error into the BIND taxonomy. A network/timeout
 * (`status === null`) is passed through so `run()` classifies it as
 * `network_error`; an HTTP status → `BindApiError` (`api_error`); a malformed
 * body → `BindApiError` 502 rather than a blind-cast success. */
function mapBindError(err: unknown): unknown {
  if (err instanceof ArAgentsResponseValidationError) {
    return new BindApiError(502, { error: "malformed_response", detail: err.message });
  }
  if (err instanceof ArAgentsRateLimitError) {
    return new BindApiError(429, err.context["body"] ?? null);
  }
  if (err instanceof ArAgentsProtocolError) {
    return err.status === null
      ? err
      : new BindApiError(err.status, err.context["body"] ?? null);
  }
  return err;
}

export interface BindAdapter {
  listAccounts(): Promise<BindResult<BindAccount[]>>;
  getMovements(args: GetMovementsArgs): Promise<BindResult<BindMovement[]>>;
  getCbuOwner(args: GetCbuOwnerArgs): Promise<BindResult<CbuOwnership>>;
  createTransfer(
    accountId: string,
    req: BindTransferRequest,
  ): Promise<BindResult<BindTransferResult>>;
  createDebin(
    accountId: string,
    req: BindDebinRequest,
  ): Promise<BindResult<BindDebinResult>>;
  getEcheqs(args: GetEcheqsArgs): Promise<BindResult<BindEcheq[]>>;
}

const UNCONFIGURED_MESSAGE =
  "BIND adapter is not configured. Wire an HttpBindAdapter with sandbox or production credentials obtained during BIND APIBANK onboarding. No money was moved.";

/** Default. Resolves structured not-configured results. Never throws. */
export class UnconfiguredBindAdapter implements BindAdapter {
  private fail<T>(): Promise<BindResult<T>> {
    return Promise.resolve(bindErr<T>("unconfigured", UNCONFIGURED_MESSAGE));
  }
  listAccounts() {
    return this.fail<BindAccount[]>();
  }
  getMovements() {
    return this.fail<BindMovement[]>();
  }
  getCbuOwner() {
    return this.fail<CbuOwnership>();
  }
  createTransfer() {
    return this.fail<BindTransferResult>();
  }
  createDebin() {
    return this.fail<BindDebinResult>();
  }
  getEcheqs() {
    return this.fail<BindEcheq[]>();
  }
}

// ── Real adapter ────────────────────────────────────────────────

export const SANDBOX_BASE_URL = "https://sandbox.bind.com.ar/v1";

/** BIND (Banco Industrial) BCRA entity code. */
export const BIND_BANK_ID = 322;

export interface HttpBindAdapterOptions {
  /**
   * API base URL, NO trailing slash. Defaults to the public sandbox.
   * BIND hands the production URL over during onboarding.
   */
  baseUrl?: string;
  /** APIBANK username. Required unless a pre-issued `token` is given. */
  username?: string;
  /** APIBANK password. Required unless a pre-issued `token` is given. */
  password?: string;
  /** Pre-issued JWT. Optional; when expired the adapter falls back to
   * username/password re-login (if provided). */
  token?: string;
  /** Entity id. Defaults to 322 (BIND). Banco de Valores piggybacks on
   * the same API with bank_id 198. */
  bankId?: number;
  /** View id. The public docs use "owner" everywhere. */
  viewId?: string;
  /** Pluggable fetch (testing, custom agents, mTLS dispatchers). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 15_000. */
  timeoutMs?: number;
}

interface TokenState {
  token: string;
  /** Epoch ms after which we proactively re-login. */
  expiresAtMs: number;
}

/**
 * Real-network adapter. Edge-compatible: fetch only, zero heavy deps.
 * Handles JWT login + refresh transparently: logs in lazily on first
 * call, re-logs in 60s before `expires_in` elapses, and retries ONCE on
 * an unexpected 401 (token revoked server-side).
 */
export class HttpBindAdapter implements BindAdapter {
  private readonly username?: string | undefined;
  private readonly password?: string | undefined;
  private readonly bankId: number;
  private readonly viewId: string;
  private readonly client: HttpClient;
  private tokenState: TokenState | null = null;

  constructor(opts: HttpBindAdapterOptions = {}) {
    if (!opts.token && (!opts.username || !opts.password)) {
      throw new BindValidationError(
        "credentials",
        "provide username + password, or a pre-issued token",
      );
    }
    this.username = opts.username;
    this.password = opts.password;
    this.bankId = opts.bankId ?? BIND_BANK_ID;
    this.viewId = opts.viewId ?? "owner";
    this.client = new HttpClient({
      baseUrl: (opts.baseUrl ?? SANDBOX_BASE_URL).replace(/\/$/, ""),
      timeoutMs: opts.timeoutMs ?? 15_000,
      // Idempotent GET reads retry a transient 5xx; the money POSTs (TRANSFER /
      // DEBIN) and login are non-idempotent and are NEVER auto-retried.
      retry: { maxAttempts: 2 },
      ...(opts.fetchImpl !== undefined ? { fetch: opts.fetchImpl } : {}),
    });
    if (opts.token) {
      // Unknown expiry for a pre-issued token; assume 1h like the docs.
      this.tokenState = { token: opts.token, expiresAtMs: Date.now() + 3_600_000 };
    }
  }

  // ── Auth ──────────────────────────────────────────────────────

  /** POST /login/jwt -> { token, expires_in }. VERIFIED shape. */
  private async login(): Promise<string> {
    if (!this.username || !this.password) {
      throw new BindAuthError(
        "BIND token expired and no username/password available to re-login.",
      );
    }
    let raw: z.infer<typeof loginSchema>;
    try {
      raw = await this.client.request({
        method: "POST",
        path: "/login/jwt",
        body: { username: this.username, password: this.password },
        schema: loginSchema,
      });
    } catch (err) {
      if (err instanceof ArAgentsAuthError) {
        throw new BindAuthError(
          `BIND rejected the credentials (HTTP ${err.context["status"] ?? 401}).`,
        );
      }
      throw mapBindError(err);
    }
    const ttlMs = (raw.expires_in ?? 3600) * 1000;
    // Refresh 60s early so in-flight requests never carry a dying token.
    this.tokenState = {
      token: raw.token,
      expiresAtMs: Date.now() + Math.max(ttlMs - 60_000, 30_000),
    };
    return raw.token;
  }

  private async ensureToken(): Promise<string> {
    if (this.tokenState && Date.now() < this.tokenState.expiresAtMs) {
      return this.tokenState.token;
    }
    return this.login();
  }

  /**
   * Authenticated request via the shared client. Header scheme is the literal
   * `JWT <token>` (NOT Bearer) per the public docs. Retries once on a 401 by
   * forcing a fresh login (covers server-side token revocation).
   */
  private async request<T>(
    path: string,
    opts: {
      method?: HttpMethod;
      body?: unknown;
      extraHeaders?: Record<string, string>;
      schema: ResponseSchema<T>;
    },
    retried = false,
  ): Promise<T> {
    const token = await this.ensureToken();
    try {
      return await this.client.request<T>({
        path,
        method: opts.method ?? "GET",
        schema: opts.schema,
        headers: { authorization: `JWT ${token}`, ...(opts.extraHeaders ?? {}) },
        ...(opts.body !== undefined ? { body: opts.body } : {}),
      });
    } catch (err) {
      if (err instanceof ArAgentsAuthError && err.context["status"] === 401 && !retried) {
        this.tokenState = null; // server-side revocation → force one re-login
        return this.request<T>(path, opts, true);
      }
      if (err instanceof ArAgentsAuthError) {
        throw new BindAuthError(
          `BIND rejected the token (HTTP ${err.context["status"] ?? 401}).`,
        );
      }
      throw mapBindError(err);
    }
  }

  /** Wrap a thrown BindError into the structured BindResult envelope. */
  private async run<T>(fn: () => Promise<T>): Promise<BindResult<T>> {
    try {
      return bindOk(await fn());
    } catch (err) {
      if (err instanceof BindApiError || err instanceof BindAuthError) {
        return bindErr<T>(err.code, err.message, err.status);
      }
      if (err instanceof BindValidationError) {
        return bindErr<T>("validation", err.message);
      }
      return bindErr<T>(
        "network_error",
        `BIND request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private accountBase(accountId: string): string {
    return `/banks/${this.bankId}/accounts/${encodeURIComponent(accountId)}/${this.viewId}`;
  }

  // ── Operations ────────────────────────────────────────────────

  listAccounts(): Promise<BindResult<BindAccount[]>> {
    return this.run(() =>
      this.request(`/banks/${this.bankId}/accounts/${this.viewId}`, {
        method: "GET",
        schema: bindAccountsSchema,
      }),
    );
  }

  getMovements(args: GetMovementsArgs): Promise<BindResult<BindMovement[]>> {
    return this.run(() => {
      const extraHeaders: Record<string, string> = {};
      if (args.fromDate) extraHeaders["obp_from_date"] = args.fromDate;
      if (args.toDate) extraHeaders["obp_to_date"] = args.toDate;
      if (args.limit !== undefined) extraHeaders["obp_limit"] = String(args.limit);
      if (args.offset !== undefined) extraHeaders["obp_offset"] = String(args.offset);
      return this.request(`${this.accountBase(args.accountId)}/transactions`, {
        method: "GET",
        extraHeaders,
        schema: bindMovementsSchema,
      });
    });
  }

  getCbuOwner(args: GetCbuOwnerArgs): Promise<BindResult<CbuOwnership>> {
    return this.run(() => {
      if (args.cbuCvu && args.alias) {
        throw new BindValidationError("cbuCvu/alias", "pass exactly one, not both");
      }
      if (args.cbuCvu) {
        if (!/^[0-9]{22}$/.test(args.cbuCvu)) {
          throw new BindValidationError("cbuCvu", "must be 22 numeric digits");
        }
        return this.request(`/accounts/cbu/${args.cbuCvu}`, {
          method: "GET",
          schema: cbuOwnershipSchema,
        });
      }
      if (args.alias) {
        return this.request(`/accounts/alias/${encodeURIComponent(args.alias)}`, {
          method: "GET",
          schema: cbuOwnershipSchema,
        });
      }
      throw new BindValidationError("cbuCvu/alias", "one of the two is required");
    });
  }

  createTransfer(
    accountId: string,
    req: BindTransferRequest,
  ): Promise<BindResult<BindTransferResult>> {
    return this.run(() => {
      if (!req.to.cbu && !req.to.label) {
        throw new BindValidationError("to", "either to.cbu or to.label is required");
      }
      if (req.value.amount <= 0) {
        throw new BindValidationError("value.amount", "must be greater than zero");
      }
      return this.request(
        `${this.accountBase(accountId)}/transaction-request-types/TRANSFER/transaction-requests`,
        { method: "POST", body: req, schema: bindTransferResultSchema },
      );
    });
  }

  createDebin(
    accountId: string,
    req: BindDebinRequest,
  ): Promise<BindResult<BindDebinResult>> {
    return this.run(() => {
      if (!req.to.cbu && !req.to.label) {
        throw new BindValidationError("to", "either to.cbu or to.label is required");
      }
      if (req.value.amount <= 0) {
        throw new BindValidationError("value.amount", "must be greater than zero");
      }
      return this.request(
        `${this.accountBase(accountId)}/transaction-request-types/DEBIN/transaction-requests`,
        { method: "POST", body: req, schema: bindDebinResultSchema },
      );
    });
  }

  getEcheqs(args: GetEcheqsArgs): Promise<BindResult<BindEcheq[]>> {
    return this.run(() => {
      const extraHeaders: Record<string, string> = { obp_status: args.status };
      if (args.mode) extraHeaders["obp_mode"] = args.mode;
      if (args.limit !== undefined) extraHeaders["obp_limit"] = String(args.limit);
      if (args.offset !== undefined) extraHeaders["obp_offset"] = String(args.offset);
      if (args.issuedFromDate) extraHeaders["obp_issued_from_date"] = args.issuedFromDate;
      if (args.issuedToDate) extraHeaders["obp_issued_to_date"] = args.issuedToDate;
      return this.request(
        `${this.accountBase(args.accountId)}/transaction-request-types/CHECK`,
        { method: "GET", extraHeaders, schema: bindEcheqsSchema },
      );
    });
  }
}
