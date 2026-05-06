/**
 * Subpath entry for the Magic.link SDK adapter —
 * `@ar-agents/identity-attest/magic-link-sdk`.
 *
 * # Why a subpath
 *
 * `@magic-sdk/admin` (the underlying Magic.link Node SDK) imports
 * `node:crypto`, `node:stream`, `node:http`, and other Node-only modules.
 * The MAIN `@ar-agents/identity-attest` bundle is Edge-Runtime safe;
 * pulling MagicLinkSdkAdapter into Edge would crash the build.
 *
 * Importing from this subpath signals: "I need Magic.link, I'm running on
 * Node only, I accept the runtime restriction."
 *
 * # Usage
 *
 * ```ts
 * import { AttestationClient } from "@ar-agents/identity-attest";
 * import { MagicLinkSdkAdapter } from "@ar-agents/identity-attest/magic-link-sdk";
 *
 * const client = new AttestationClient({
 *   signingSecret: process.env.ATTEST_SIGNING_SECRET!,
 *   adapters: {
 *     magic_link: new MagicLinkSdkAdapter({
 *       secretKey: process.env.MAGIC_SECRET_KEY!,
 *     }),
 *   },
 * });
 * ```
 */

export {
  MagicLinkSdkAdapter,
  type MagicLinkSdkAdapterOptions,
} from "./adapters/magic-link-sdk";
