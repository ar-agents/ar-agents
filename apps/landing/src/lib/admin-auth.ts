/**
 * Shared REGISTRY_ADMIN_TOKEN gate for admin-only API surfaces.
 *
 * One implementation for the check that used to be copy-pasted into eight
 * route files (admin/registry, admin/registry/ubo, admin/oracle/consumers,
 * admin/shadow-stats, formation/pack, registry, registry/portability,
 * certifier/revoke). Auth logic duplicated per route is a divergence bug
 * waiting to happen; every admin surface must fail closed the same way.
 *
 * Semantics (unchanged from the previous copies):
 *   - REGISTRY_ADMIN_TOKEN unset -> always false (fail-closed: admin surface
 *     is disabled, never open).
 *   - Credential is read from `x-admin-token` or `Authorization: Bearer ...`.
 *   - Comparison is constant-time (Edge-safe, Web Crypto only).
 *
 * Not for cron routes (those verify CRON_SECRET) or oracle consumer keys
 * (lib/oracle-consumer.ts); different credentials, different lifecycles.
 */

import { constantTimeEqual } from "./incorporate-auth";

export async function isRegistryAdmin(req: Request): Promise<boolean> {
  const configured = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  if (!configured) return false;
  const presented =
    req.headers.get("x-admin-token")?.trim() ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;
  return constantTimeEqual(presented, configured);
}
