// Client-side bootstrap for the anonymous studio account (docs/CONTRACT.md
// "Accounts"). Storage-agnostic (a Pick<Storage,...> instead of the global
// `localStorage`) and fetch-agnostic so it is unit-testable without a DOM or
// a real network stack.

export interface StudioAccount {
  accountId: string;
  token: string;
}

export type MinimalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "studio.account.v1";

/** Reads the account from storage, tolerating a missing key, corrupt JSON, or
 *  a storage backend that throws (e.g. disabled localStorage). */
export function readStoredAccount(storage: MinimalStorage): StudioAccount | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StudioAccount> | null;
    if (parsed && typeof parsed.accountId === "string" && typeof parsed.token === "string") {
      return { accountId: parsed.accountId, token: parsed.token };
    }
  } catch {
    // corrupt JSON: treat as no stored account
  }
  return null;
}

export function writeStoredAccount(storage: MinimalStorage, account: StudioAccount): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(account));
}

export function clearStoredAccount(storage: MinimalStorage): void {
  storage.removeItem(STORAGE_KEY);
}

export class AccountBootstrapError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AccountBootstrapError";
    this.status = status;
  }
}

/**
 * Returns the stored account if present, otherwise POSTs /api/account (no
 * auth required, per the contract) and persists the result. The token is
 * returned exactly once by the server (write-once capability); losing the
 * stored copy means starting a new anonymous account, not recovering the old
 * one, so this never re-fetches once something is stored.
 */
export async function ensureAccount(options: {
  storage: MinimalStorage;
  fetchImpl?: typeof fetch;
}): Promise<StudioAccount> {
  const existing = readStoredAccount(options.storage);
  if (existing) return existing;

  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl("/api/account", { method: "POST" });
  if (!res.ok) {
    throw new AccountBootstrapError(`account_bootstrap_failed:${res.status}`, res.status);
  }
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; accountId?: string; token?: string }
    | null;
  if (!data?.ok || typeof data.accountId !== "string" || typeof data.token !== "string") {
    throw new AccountBootstrapError("account_bootstrap_invalid_response");
  }
  const account: StudioAccount = { accountId: data.accountId, token: data.token };
  writeStoredAccount(options.storage, account);
  return account;
}
