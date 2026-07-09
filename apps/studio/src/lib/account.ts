/**
 * Anonymous studio accounts: mint/verify a write-once bearer token, and the
 * account -> society mapping. Studio owns only accounts, metering, and this
 * mapping (the societies themselves live at ar-agents.ar).
 *
 * Auth is a single header, `x-studio-token: stu_...`, with no companion
 * account id sent alongside it. So the token is self-describing:
 * `stu_<accountId>_<secret>`. The accountId segment is not a secret (it is
 * already visible in the token string); only the secret half is checked
 * against the stored hash, in constant time. This is the same write-once,
 * hash-at-rest, constant-time-verify shape as
 * apps/landing/src/lib/capability-token.ts, adapted so a bare bearer token
 * can resolve its own owner without an extra identifier.
 *
 * Storage: Vercel KV, in-memory fallback for local dev / tests.
 */

import { kv } from "@vercel/kv";

const TOKEN_PREFIX = "stu";
const enc = new TextEncoder();

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison, edge-safe (HMAC both inputs with a fresh
 *  random key, compare the fixed-length digests). Mirrors
 *  apps/landing/src/lib/incorporate-auth.ts's constantTimeEqual. */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [da, db] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  const len = Math.max(va.length, vb.length);
  let diff = va.length === vb.length ? 0 : 1;
  for (let i = 0; i < len; i++) diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  return diff === 0;
}

export interface AccountProfile {
  accountId: string;
  createdAt: string;
}

/** Where the society's own agent app (the sociedad-ia-starter scaffold) got
 *  deployed once M1-6 provisioned it. Only present in "provisioned" mode
 *  (a real `VERCEL_PROVISION_TOKEN` was configured); manual-mode deploys
 *  leave this unset since studio never learns whether the human clicked
 *  through. See src/lib/vercel-provision.ts and
 *  src/app/api/society/deploy/route.ts. */
export interface SocietyDeploy {
  projectName: string;
  url: string;
  deployedAt: string;
}

/** The account's constituted society (custodial storage). The plaintext
 *  adminToken/gateToken are kept here (not just a hash) because studio must
 *  present them to ar-agents.ar on every approvals/suspend call made on the
 *  human's behalf; both are also returned once in the constitute response so
 *  the human can self-custody them. */
export interface StoredSociety {
  sessionId: string;
  denominacion: string;
  tipo: string;
  registryId: string | null;
  adminToken: string;
  gateToken: string;
  createdAt: string;
  deploy?: SocietyDeploy | null;
  /** Studio-issued machine credential (ROADMAP.md M3-2): the deployed agent
   *  app's `GET /api/status` checks this via `Authorization: Bearer`, so
   *  studio's "sociedad en vivo" cockpit can read the society's live status.
   *  Generated locally (never derived from anything the human enters), set
   *  as a Vercel project env var on the society's own project via
   *  `setSocietyCredentialEnvVars`, and stored here so later cockpit
   *  refreshes reuse it instead of rotating it every call. Present only once
   *  provisioned (`POST /api/society/deploy`) or backfilled
   *  (`GET /api/society/activity`, for a society deployed before M3-2
   *  existed). NEVER returned to the browser, never logged. */
  statusToken?: string;
  /** Whether `AUDIT_HMAC_SECRET` has been provisioned on the society's
   *  Vercel project (ROADMAP.md M3-4/M3-5: the starter's own local signed
   *  audit log, see apps/sociedad-ia-starter/src/lib/audit-log.ts). Same
   *  minted-once, never-re-sent shape as `statusToken`, but studio never
   *  needs the SECRET'S VALUE back (unlike statusToken, nothing studio
   *  calls is authenticated with it -- it only ever signs entries inside
   *  the starter's own process), so only a boolean is kept here, just
   *  enough to stop `ensureAuditSecret` from re-minting (and thereby
   *  invalidating previously-signed entries) on every cockpit poll. */
  auditSecretSet?: boolean;
  /** Whether `SOCIEDAD_IA_DENOMINACION` has been set on the society's
   *  Vercel project (ROADMAP.md M3-3: the starter's branded homepage reads
   *  it to show the society's real name instead of its ACME-AI
   *  placeholder). Same minted-once-per-deploy, best-effort shape as
   *  {@link auditSecretSet}; unlike `statusToken`/the audit secret this is
   *  not a generated secret but the society's own `denominacion` (already
   *  known here), so only the "did we push it" boolean needs tracking. */
  denominacionSet?: boolean;
}

// The in-memory fallback must live on globalThis: in dev each route module
// can get its own module instance, and per-module Maps make an account
// minted by /api/account invisible to /api/society (401 on a valid token).
const g = globalThis as typeof globalThis & {
  __studioAccountMem?: {
    tokenHash: Map<string, string>;
    profile: Map<string, AccountProfile>;
    society: Map<string, StoredSociety>;
  };
};
g.__studioAccountMem ??= {
  tokenHash: new Map(),
  profile: new Map(),
  society: new Map(),
};
const memTokenHash = g.__studioAccountMem.tokenHash;
const memProfile = g.__studioAccountMem.profile;
const memSociety = g.__studioAccountMem.society;

const tokenKey = (accountId: string) => `studio:accounttoken:${accountId}`;
const profileKey = (accountId: string) => `studio:account:${accountId}`;
const societyKey = (accountId: string) => `studio:society:${accountId}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mint a fresh account + its write-once token. Returns the plaintext token
 * exactly once; only its hash is stored. Returns null on a (near-impossible)
 * accountId collision or a storage failure while writing the token hash.
 */
export async function createAccount(): Promise<{ accountId: string; token: string } | null> {
  const accountId = crypto.randomUUID();
  const secret = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
  const token = `${TOKEN_PREFIX}_${accountId}_${secret}`;
  const hash = await sha256hex(token);
  try {
    if (isKvWired()) {
      const got = await kv.set(tokenKey(accountId), hash, { nx: true });
      if (!got) return null; // write-once: an accountId collision, never rotate
      await kv.set(profileKey(accountId), { accountId, createdAt: new Date().toISOString() });
    } else {
      if (memTokenHash.has(accountId)) return null;
      memTokenHash.set(accountId, hash);
      memProfile.set(accountId, { accountId, createdAt: new Date().toISOString() });
    }
  } catch {
    return null;
  }
  return { accountId, token };
}

/**
 * Verify a presented `x-studio-token` value. Returns the accountId it proves
 * possession of, or null when malformed, unknown, or mismatched.
 */
export async function verifyAccountToken(token: string): Promise<string | null> {
  if (!token || token.length < 16) return null;
  const parts = token.split("_");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const accountId = parts[1]!;
  if (!UUID_RE.test(accountId)) return null;
  try {
    const stored = isKvWired()
      ? await kv.get<string>(tokenKey(accountId))
      : (memTokenHash.get(accountId) ?? null);
    if (!stored) return null;
    const hash = await sha256hex(token);
    return (await constantTimeEqual(hash, stored)) ? accountId : null;
  } catch {
    return null;
  }
}

export type AuthResult =
  | { ok: true; accountId: string }
  | { ok: false; status: 401; error: string };

/** Shared account auth for every `x-studio-token`-protected route. */
export async function authenticate(req: Request): Promise<AuthResult> {
  const presented = req.headers.get("x-studio-token")?.trim() ?? "";
  const accountId = presented ? await verifyAccountToken(presented) : null;
  if (!accountId) return { ok: false, status: 401, error: "no_autorizado" };
  return { ok: true, accountId };
}

export async function getAccountProfile(accountId: string): Promise<AccountProfile | null> {
  try {
    const p = isKvWired()
      ? await kv.get<AccountProfile>(profileKey(accountId))
      : (memProfile.get(accountId) ?? null);
    return p ?? null;
  } catch {
    return null;
  }
}

export async function getStoredSociety(accountId: string): Promise<StoredSociety | null> {
  try {
    const s = isKvWired()
      ? await kv.get<StoredSociety>(societyKey(accountId))
      : (memSociety.get(accountId) ?? null);
    return s ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist the account's constituted society. Callers gate the one-society
 * -per-account rule with {@link getStoredSociety} BEFORE calling the
 * upstream incorporate-attested act, so in normal operation this never
 * overwrites an existing record. Best-effort at the storage layer: the
 * upstream act already happened (irreversible), so a failure to persist the
 * mapping must not throw past it. The human still gets their credentials
 * back in the route response (self-custody).
 */
export async function setStoredSociety(accountId: string, society: StoredSociety): Promise<void> {
  try {
    if (isKvWired()) {
      await kv.set(societyKey(accountId), society);
    } else {
      memSociety.set(accountId, society);
    }
  } catch {
    // best-effort, see doc comment above
  }
}

/**
 * Persist a successful provisioned deploy against the account's already
 * -stored society (see `POST /api/society/deploy`, provisioned mode). A
 * no-op when the account has no stored society (should not happen: the
 * route checks this first), best-effort at the storage layer like
 * {@link setStoredSociety}.
 */
export async function setSocietyDeploy(accountId: string, deploy: SocietyDeploy): Promise<void> {
  const existing = await getStoredSociety(accountId);
  if (!existing) return;
  await setStoredSociety(accountId, { ...existing, deploy });
}

/**
 * Persist a freshly-minted `STUDIO_STATUS_TOKEN` against the account's
 * already-stored society (see `POST /api/society/deploy`'s provisioned mode
 * and `GET /api/society/activity`'s backfill path). Same no-op-when-missing,
 * best-effort shape as {@link setSocietyDeploy}.
 */
export async function setSocietyStatusToken(accountId: string, statusToken: string): Promise<void> {
  const existing = await getStoredSociety(accountId);
  if (!existing) return;
  await setStoredSociety(accountId, { ...existing, statusToken });
}

/**
 * Mark `AUDIT_HMAC_SECRET` as provisioned against the account's already
 * -stored society (see `POST /api/society/deploy`'s provisioned mode and
 * `GET /api/society/activity`'s backfill path). Same no-op-when-missing,
 * best-effort shape as {@link setSocietyStatusToken}; stores only the
 * boolean, not the secret (see {@link StoredSociety.auditSecretSet}).
 */
export async function setSocietyAuditSecretSet(accountId: string): Promise<void> {
  const existing = await getStoredSociety(accountId);
  if (!existing) return;
  await setStoredSociety(accountId, { ...existing, auditSecretSet: true });
}

/**
 * Mark `SOCIEDAD_IA_DENOMINACION` as set against the account's already
 * -stored society (see `POST /api/society/deploy`'s provisioned mode and
 * `GET /api/society/activity`'s backfill path). Same no-op-when-missing,
 * best-effort shape as {@link setSocietyAuditSecretSet}.
 */
export async function setSocietyDenominacionSet(accountId: string): Promise<void> {
  const existing = await getStoredSociety(accountId);
  if (!existing) return;
  await setStoredSociety(accountId, { ...existing, denominacionSet: true });
}
