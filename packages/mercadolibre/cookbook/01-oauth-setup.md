# Recipe 01 — OAuth setup that survives single-use refresh tokens

MELI's refresh tokens are **single-use**: every refresh exchange invalidates the previous `refresh_token`. If two requests refresh in parallel, one wins, the other gets `refresh_token_reused`, and **both** tokens are now dead. The naïve "UPDATE row SET access_token = $new" loses ~5–10% of refreshes under any concurrency.

This package gives you two layers of defence:

1. An **in-process mutex** keyed by `userId` that coalesces concurrent refreshes inside one Node process / one Edge isolate.
2. A **token store interface** (`read` / `write` / `remove?`) you implement with a database-level compare-and-swap so cross-process races also fail safely.

## The store contract

```ts
import type { OAuthTokenStore } from "@ar-agents/mercadolibre";

// The actual interface (matches src/oauth.ts):
//   read(userId): Promise<MeliOAuthTokens | null>
//   write(userId, tokens): Promise<void>
//   remove?(userId): Promise<void>
```

`read` returns the current tokens. `write` atomically replaces them. `remove` is optional and only used if the seller explicitly revokes.

## Reference implementation: Vercel Postgres + CAS

```ts
import { MeliClient, type OAuthTokenStore } from "@ar-agents/mercadolibre";
import { sql } from "@vercel/postgres";

// Track the last-read refresh_token per user so write() can CAS against it.
// In a long-lived process this stays bounded (one entry per active seller).
const lastSeenRefreshToken = new Map<number, string>();

const store: OAuthTokenStore = {
  async read(userId) {
    const { rows } = await sql`
      SELECT access_token, refresh_token, expires_at
      FROM meli_tokens WHERE user_id = ${userId}
    `;
    if (!rows[0]) return null;
    lastSeenRefreshToken.set(userId, rows[0].refresh_token);
    return {
      access_token: rows[0].access_token,
      refresh_token: rows[0].refresh_token,
      expires_at: new Date(rows[0].expires_at).getTime(),
    };
  },

  async write(userId, tokens) {
    const oldRt = lastSeenRefreshToken.get(userId);
    // Atomic update: succeeds only if no other process has rotated since we read.
    // If oldRt is undefined, it's the first save (initial OAuth callback).
    const { rowCount } = oldRt
      ? await sql`
          UPDATE meli_tokens
             SET access_token  = ${tokens.access_token},
                 refresh_token = ${tokens.refresh_token},
                 expires_at    = to_timestamp(${tokens.expires_at} / 1000.0)
           WHERE user_id = ${userId}
             AND refresh_token = ${oldRt}
        `
      : await sql`
          INSERT INTO meli_tokens (user_id, access_token, refresh_token, expires_at)
          VALUES (${userId},
                  ${tokens.access_token},
                  ${tokens.refresh_token},
                  to_timestamp(${tokens.expires_at} / 1000.0))
          ON CONFLICT (user_id) DO NOTHING
        `;

    if (rowCount === 0) {
      // Lost the CAS — another worker rotated first. The library's MeliAuthError
      // handler will let the next `read()` pick up the winning tokens.
      throw new Error("token_rotation_lost_race");
    }
    lastSeenRefreshToken.set(userId, tokens.refresh_token);
  },

  async remove(userId) {
    await sql`DELETE FROM meli_tokens WHERE user_id = ${userId}`;
    lastSeenRefreshToken.delete(userId);
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

## Why the in-memory `lastSeenRefreshToken` map is safe

- One entry per seller, GC'd when the seller logs out (`remove`).
- The library's per-`userId` mutex serializes refresh attempts inside a single isolate, so the `read` → `refresh` → `write` triple is never interleaved within one process.
- Cross-process races still fall through to the database CAS — the loser throws `token_rotation_lost_race`, the lib catches it as `MeliAuthError`, and the next call's `read` returns the winning tokens.

## What if you can't keep state in memory? (pure-Edge / serverless cold-starts)

Drop the map and instead read-then-CAS-in-one-statement:

```ts
async write(userId, tokens) {
  const { rowCount } = await sql`
    UPDATE meli_tokens
       SET access_token  = ${tokens.access_token},
           refresh_token = ${tokens.refresh_token},
           expires_at    = to_timestamp(${tokens.expires_at} / 1000.0)
     WHERE user_id = ${userId}
       AND expires_at < to_timestamp(${tokens.expires_at} / 1000.0)
  `;
  if (rowCount === 0) throw new Error("token_rotation_lost_race");
}
```

The monotonic-`expires_at` predicate guarantees you never overwrite newer tokens with stale ones — no shared state needed.
