/**
 * Vercel AI SDK tool collection for `@ar-agents/mi-argentina`.
 *
 * The OAuth dance is fundamentally human-in-the-loop: only the user's
 * browser can authenticate to Mi Argentina. The agent's job is to PRODUCE
 * the URL, INSTRUCT the user, and COMPLETE the exchange when the callback
 * arrives. These tools capture exactly that surface.
 *
 * # Tool selection
 *
 * - `mi_argentina_start_login`: the agent says "click here" and stores
 *   the verifier server-side.
 * - `mi_argentina_complete_login`: agent receives `code` + `state` from
 *   the callback and finishes the flow.
 * - `mi_argentina_get_user_profile`: when an access token is already in
 *   hand, fetch the user's identity claims.
 * - `mi_argentina_verify_id_token`: confirm a JWT is genuine before any
 *   trust decision.
 * - `mi_argentina_refresh_token`: extend a session that's about to expire.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { MiArgentinaClient } from "./oidc";

export type MiArgentinaToolName =
  | "mi_argentina_start_login"
  | "mi_argentina_complete_login"
  | "mi_argentina_get_user_profile"
  | "mi_argentina_verify_id_token"
  | "mi_argentina_refresh_token";

export interface MiArgentinaToolsOptions {
  /**
   * Override the agent-facing tool descriptions. Pass an object with keys
   * matching tool names; values replace the default description.
   */
  descriptions?: Partial<Record<MiArgentinaToolName, string>>;
}

const DEFAULT_DESCRIPTIONS: Record<MiArgentinaToolName, string> = {
  mi_argentina_start_login:
    "Begin a Mi Argentina government login (iniciar sesión con Mi Argentina, OIDC). Returns an authorization URL the user must open in a browser, plus the OAuth `state` value the callback will return. SIDE EFFECT: stores PKCE verifier + nonce + state server-side; subsequent `mi_argentina_complete_login` requires this state. USE THIS WHEN: the user wants to log in with their gov.ar account, or wants to grant your agent access to claims like CUIL, DNI, name, or domicilio. AFTER calling: tell the user to open the URL in their browser, complete the consent, and report back the `code` and `state` values from the callback URL.",

  mi_argentina_complete_login:
    "Complete a Mi Argentina login (completar el login de Mi Argentina) by exchanging the authorization code for tokens and verifying the ID token. Pass BOTH the `code` and `state` values that arrived in the callback URL, the package atomically consumes the matching server-side state and verifies the ID token signature, issuer, audience, expiration, and nonce. Returns the user's verified profile (CUIL, DNI, name, etc.) and the access/refresh tokens. WHEN THIS FAILS: surface the error message verbatim, it tells the user (and you) whether to retry the login, contact support, or restart from scratch.",

  mi_argentina_get_user_profile:
    "Fetch the Mi Argentina user profile (perfil del usuario de Mi Argentina) via the OIDC userinfo endpoint, given an access token already obtained from `mi_argentina_complete_login`. Returns sub, CUIL, DNI, names, email, optional domicilio. USE THIS WHEN: you have an active access token and the local cache is stale or missing. DO NOT USE WHEN: you only have an ID token, call `mi_argentina_verify_id_token` for that. NOTE: the access token expires (typically 1 hour); call `mi_argentina_refresh_token` when expired.",

  mi_argentina_verify_id_token:
    "Verify a Mi Argentina ID token (compact JWT) end-to-end: signature, issuer, audience, expiration. Returns the verified claims when valid; throws when invalid. USE THIS WHEN: you receive an ID token from a frontend or another service and need to trust its claims. DO NOT trust any claim without calling this first, the token can be malformed, expired, or forged.",

  mi_argentina_refresh_token:
    "Exchange a refresh token for a new access token. Returns a new TokenResponse with refreshed access_token, id_token, and (per provider policy) a possibly-rotated refresh_token. USE THIS WHEN: an access token has expired or is about to. WHEN THIS FAILS: the refresh token is revoked or expired; the user must restart the login flow from `mi_argentina_start_login`.",
};

export function miArgentinaTools(
  client: MiArgentinaClient,
  options: MiArgentinaToolsOptions = {},
): ToolSet {
  const desc = (name: MiArgentinaToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];

  return {
    mi_argentina_start_login: tool({
      description: desc("mi_argentina_start_login"),
      inputSchema: z.object({
        scope: z
          .array(z.string())
          .optional()
          .describe(
            "Scopes to request. Common: 'openid', 'profile', 'email', 'cuil', 'dni', 'domicilio'. Default: ['openid','profile','email'].",
          ),
        prompt: z
          .enum(["none", "login", "consent", "select_account"])
          .optional()
          .describe(
            "OIDC prompt parameter. Use 'login' to force re-auth even if the user has a session.",
          ),
        ui_locales: z
          .string()
          .optional()
          .describe("Locale hint, e.g. 'es-AR' or 'en'."),
        login_hint: z
          .string()
          .optional()
          .describe("Pre-fill the form with this CUIL/email."),
      }),
      execute: async (input) => {
        const req: Parameters<typeof client.getAuthorizationUrl>[0] = {};
        if (input.scope !== undefined) req.scope = input.scope;
        if (input.prompt !== undefined) req.prompt = input.prompt;
        if (input.ui_locales !== undefined) req.uiLocales = input.ui_locales;
        if (input.login_hint !== undefined) req.loginHint = input.login_hint;
        const result = await client.getAuthorizationUrl(req);
        return {
          authorization_url: result.url,
          state: result.state,
          scope: result.scope,
          message:
            "Open authorization_url in a browser. After the user consents, the browser will be redirected to your registered redirect_uri with `code` and `state` query parameters. Pass both to mi_argentina_complete_login.",
        };
      },
    }),

    mi_argentina_complete_login: tool({
      description: desc("mi_argentina_complete_login"),
      inputSchema: z.object({
        code: z.string().describe("The `code` query parameter from the callback URL."),
        state: z.string().describe("The `state` query parameter from the callback URL, must match what was generated."),
        fetch_user_info: z
          .boolean()
          .optional()
          .describe(
            "When true, also fetch the userinfo endpoint and include `profile` in the result. Default: true.",
          ),
      }),
      execute: async (input) => {
        const result = await client.exchangeCode({
          code: input.code,
          state: input.state,
          fetchUserInfo: input.fetch_user_info ?? true,
        });
        return {
          access_token: result.tokens.accessToken,
          id_token: result.tokens.idToken,
          refresh_token: result.tokens.refreshToken,
          expires_in: result.tokens.expiresIn,
          scope: result.tokens.scope,
          claims: result.idToken.claims,
          profile: result.profile,
        };
      },
    }),

    mi_argentina_get_user_profile: tool({
      description: desc("mi_argentina_get_user_profile"),
      inputSchema: z.object({
        access_token: z.string().describe("Bearer access token from a previous login."),
      }),
      execute: async (input) => {
        const profile = await client.getUserInfo(input.access_token);
        return profile;
      },
    }),

    mi_argentina_verify_id_token: tool({
      description: desc("mi_argentina_verify_id_token"),
      inputSchema: z.object({
        id_token: z.string().describe("Compact JWT (three base64url segments separated by dots)."),
        nonce: z
          .string()
          .optional()
          .describe(
            "Expected nonce. Required if the original authorization request set one; omit otherwise.",
          ),
      }),
      execute: async (input) => {
        const verified = await client.verifyIdToken(input.id_token, input.nonce);
        return {
          valid: true,
          header: verified.header,
          claims: verified.claims,
        };
      },
    }),

    mi_argentina_refresh_token: tool({
      description: desc("mi_argentina_refresh_token"),
      inputSchema: z.object({
        refresh_token: z.string().describe("Refresh token from a prior login."),
      }),
      execute: async (input) => {
        const result = await client.refreshToken(input.refresh_token);
        return {
          access_token: result.accessToken,
          id_token: result.idToken,
          refresh_token: result.refreshToken,
          expires_in: result.expiresIn,
          scope: result.scope,
        };
      },
    }),
  };
}
