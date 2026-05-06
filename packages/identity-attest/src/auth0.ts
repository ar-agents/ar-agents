/**
 * Subpath entry for the Auth0 adapter — `@ar-agents/identity-attest/auth0`.
 *
 * # Why a subpath
 *
 * The Auth0Adapter uses `node:crypto` for PKCE generation (the
 * `AttestAdapter.generateSecret()` interface is sync, while Web Crypto's
 * `subtle.digest` is async — making it async would be a breaking change
 * to every adapter implementation).
 *
 * The MAIN bundle (`@ar-agents/identity-attest`) is fully Edge-Runtime
 * safe: AttestationClient uses Web Crypto via `./crypto`, and the
 * built-in WhatsApp OTP + Email Magic Link adapters don't need PKCE.
 *
 * Importing from this subpath signals: "I need Auth0, I'm running on
 * Node only, I accept the runtime restriction."
 *
 * # Usage
 *
 * ```ts
 * import { AttestationClient } from "@ar-agents/identity-attest";
 * import { Auth0Adapter } from "@ar-agents/identity-attest/auth0";
 *
 * const client = new AttestationClient({
 *   signingSecret: process.env.ATTEST_SIGNING_SECRET!,
 *   adapters: {
 *     auth0: new Auth0Adapter({
 *       domain: process.env.AUTH0_DOMAIN!,
 *       clientId: process.env.AUTH0_CLIENT_ID!,
 *       callbackUrl: process.env.AUTH0_CALLBACK!,
 *     }),
 *   },
 * });
 * ```
 */

export { Auth0Adapter, type Auth0AdapterOptions } from "./adapters/auth0";
