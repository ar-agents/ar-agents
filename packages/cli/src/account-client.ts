// Client for the studio's `/api/account` contract (see
// apps/studio/src/app/api/account/route.ts and docs/CONTRACT.md), mirroring
// apps/studio/src/lib/ui/account-client.ts's fetch-agnostic, error-class,
// shape-validation shape so this CLI is unit-testable without a real network
// stack.

export class AccountClientError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AccountClientError";
    if (status !== undefined) {
      this.status = status;
    }
  }
}

export interface AccountProfile {
  accountId: string;
  createdAt: string;
  usage: {
    month: string;
    inputTokens: number;
    outputTokens: number;
    costMicroUsd: number;
    priceMicroUsd: number;
  };
  cap: {
    monthlyCostMicroUsd: number;
    remainingMicroUsd: number;
  };
  society: { denominacion: string; suspended: boolean | null } | null;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** POST {baseUrl}/api/account (no auth): mints a fresh anonymous account. */
export async function createAccount(opts: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accountId: string; token: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${trimTrailingSlash(opts.baseUrl)}/api/account`, { method: "POST" });
  if (!res.ok) {
    throw new AccountClientError(`account_create_failed:${res.status}`, res.status);
  }
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; accountId?: string; token?: string }
    | null;
  if (!data?.ok || typeof data.accountId !== "string" || typeof data.token !== "string") {
    throw new AccountClientError("account_create_invalid_response");
  }
  return { accountId: data.accountId, token: data.token };
}

/** GET {baseUrl}/api/account with `x-studio-token`: profile + usage + cap +
 *  the account's society (if any). */
export async function getAccount(opts: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<AccountProfile> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${trimTrailingSlash(opts.baseUrl)}/api/account`, {
    method: "GET",
    headers: { "x-studio-token": opts.token },
  });
  if (!res.ok) {
    throw new AccountClientError(`account_lookup_failed:${res.status}`, res.status);
  }
  const data = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        accountId?: string;
        createdAt?: string;
        usage?: {
          month?: string;
          inputTokens?: number;
          outputTokens?: number;
          costMicroUsd?: number;
          priceMicroUsd?: number;
        };
        cap?: { monthlyCostMicroUsd?: number; remainingMicroUsd?: number };
        society?: { denominacion?: string; suspended?: boolean | null } | null;
      }
    | null;

  if (
    !data?.ok ||
    typeof data.accountId !== "string" ||
    typeof data.createdAt !== "string" ||
    typeof data.usage?.month !== "string" ||
    typeof data.usage.inputTokens !== "number" ||
    typeof data.usage.outputTokens !== "number" ||
    typeof data.usage.costMicroUsd !== "number" ||
    typeof data.usage.priceMicroUsd !== "number" ||
    typeof data.cap?.monthlyCostMicroUsd !== "number" ||
    typeof data.cap.remainingMicroUsd !== "number"
  ) {
    throw new AccountClientError("account_lookup_invalid_response");
  }

  const society =
    data.society && typeof data.society.denominacion === "string"
      ? {
          denominacion: data.society.denominacion,
          suspended: typeof data.society.suspended === "boolean" ? data.society.suspended : null,
        }
      : null;

  return {
    accountId: data.accountId,
    createdAt: data.createdAt,
    usage: {
      month: data.usage.month,
      inputTokens: data.usage.inputTokens,
      outputTokens: data.usage.outputTokens,
      costMicroUsd: data.usage.costMicroUsd,
      priceMicroUsd: data.usage.priceMicroUsd,
    },
    cap: {
      monthlyCostMicroUsd: data.cap.monthlyCostMicroUsd,
      remainingMicroUsd: data.cap.remainingMicroUsd,
    },
    society,
  };
}
