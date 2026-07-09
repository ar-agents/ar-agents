/**
 * Metadata about a society's operating credentials (ROADMAP.md M3-1). This
 * store NEVER holds a secret value: only whether an integration is
 * configured, whether it was live-verified or saved unverified/local-only,
 * a masked hint (last 4 characters max), and when it was last updated. The
 * secret itself is set once as a Vercel project env var
 * (`src/lib/vercel-provision.ts`'s `setSocietyCredentialEnvVars`) and never
 * written here.
 *
 * Storage: Vercel KV, in-memory fallback for local dev / tests -- same
 * globalThis-backed pattern as `src/lib/account.ts` (per-module Maps would
 * make an account's credentials invisible across route modules in dev).
 */

import { kv } from "@vercel/kv";
import type { IntegrationId } from "./credential-integrations";

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

export interface CredentialMeta {
  integration: IntegrationId;
  configured: boolean;
  /** True when a live upstream call confirmed the credential authenticates
   *  (Mercado Pago, WhatsApp, the model key). False for a locally-validated
   *  or format-only-validated save (AFIP cert, treasury off-ramp) and for
   *  the "platform" model choice. */
  verified: boolean;
  /** Last 4 characters of the primary secret value, or null. Never more. */
  maskedHint: string | null;
  /** Only meaningful for `model_key`: which choice the owner made. */
  modelChoice?: "platform" | "own";
  updatedAt: string;
}

const g = globalThis as typeof globalThis & {
  __studioCredentialsMem?: Map<string, CredentialMeta>;
};
g.__studioCredentialsMem ??= new Map();
const mem = g.__studioCredentialsMem;

const metaKey = (accountId: string, integration: IntegrationId) =>
  `studio:credentials:${accountId}:${integration}`;
const memKey = (accountId: string, integration: IntegrationId) => `${accountId}:${integration}`;

export async function getCredentialMeta(
  accountId: string,
  integration: IntegrationId,
): Promise<CredentialMeta | null> {
  try {
    const v = isKvWired()
      ? await kv.get<CredentialMeta>(metaKey(accountId, integration))
      : (mem.get(memKey(accountId, integration)) ?? null);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function getAllCredentialMeta(
  accountId: string,
  integrations: readonly IntegrationId[],
): Promise<Record<IntegrationId, CredentialMeta | null>> {
  const entries = await Promise.all(
    integrations.map(async (id) => [id, await getCredentialMeta(accountId, id)] as const),
  );
  return Object.fromEntries(entries) as Record<IntegrationId, CredentialMeta | null>;
}

/** Best-effort write: a metadata-persistence failure must not undo the
 *  upstream env var write that already succeeded. Callers surface the
 *  in-memory result to the caller of the route either way. */
export async function setCredentialMeta(
  accountId: string,
  integration: IntegrationId,
  meta: CredentialMeta,
): Promise<void> {
  try {
    if (isKvWired()) {
      await kv.set(metaKey(accountId, integration), meta);
    } else {
      mem.set(memKey(accountId, integration), meta);
    }
  } catch {
    // best-effort, see doc comment above
  }
}

/** Last 4 characters of a secret, for display only (never the full value).
 *  Short secrets (<=4 chars) are hidden entirely rather than shown whole. */
export function maskedHint(secret: string): string | null {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return null;
  return trimmed.slice(-4);
}
