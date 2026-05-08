# Recipe 01 — OAuth setup that survives single-use refresh tokens

MELI's refresh tokens are **single-use**: every refresh exchange invalidates the previous refresh_token. If two requests refresh in parallel, one wins, the other gets `refresh_token_reused`, and **both** tokens are now dead. The naïve "UPDATE row SET access_token = $new" loses ~5–10% of refreshes under any concurrency.

This package gives you two layers of defence:

1. An **in-process mutex** keyed by `userId` that coalesces concurrent refreshes inside one Node process / one Edge isolate.
2. A **token store interface** you implement with a database-level compare-and-swap so cross-process races also fail safely.

```ts
import { MeliClient, type OAuthTokenStore } from "@ar-agents/mercadolibre";
import { sql } from "@vercel/postgres";

const store: OAuthTokenStore = {
  async getTokens(userId) {
    const { rows } = await sql`
      SELECT access_token, refresh_token, expires_at
      FROM meli_tokens WHERE user_id = ${userId}
    `;
    if (!rows[0]) return null;
    return {
      access_token: rows[0].access_token,
      refresh_token: rows[0].refresh_token,
      expires_at: new Date(rows[0].expires_at).getTime(),
    };
  },

  async saveTokens(userId, tokens, oldRefreshToken) {
    // Atomic update: only succeeds if no other refresh has rotated the token.
    // If `oldRefreshToken` is null, it's the first save (initial OAuth callback).
    const { rowCount } = oldRefreshToken
      ? await sql`
          UPDATE meli_tokens
          SET access_token = ${tokens.access_token},
              refresh_token = ${tokens.refresh_token},
              expires_at = to_timestamp(${tokens.expires_at} / 1000.0)
          WHERE user_id = ${userId}
            AND refresh_token = ${oldRefreshToken}
        `
      : await sql`
          INSERT INTO meli_tokens (user_id, access_token, refresh_token, expires_at)
          VALUES (
            ${userId},
            ${tokens.access_token},
            ${tokens.refresh_token},
            to_timestamp(${tokens.expires_at} / 1000.0)
          )
          ON CONFLICT (user_id) DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at
        `;

    if (rowCount === 0) {
      // Lost the CAS — another worker rotated first. Re-read and use the winning token.
      throw new Error("token_rotation_lost_race");
    }
  },
};

export const client = new MeliClient({
  auth: {
    kind: "oauth",
    userId: 123_456_789,
    app: {
      clientId: process.env.MELI_APP_ID!,
      clientSecret: process.env.MELI_APP_SECRET!,
    },
    store,
  },
});
```

When `saveTokens` throws `token_rotation_lost_race`, the client's caller-side `MeliAuthError` handler can re-call the operation; the next `getTokens` will return the fresh tokens written by the winning worker.
