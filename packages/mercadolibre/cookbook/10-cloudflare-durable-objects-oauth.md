# Recipe 10 — Cross-process OAuth refresh with Cloudflare Durable Objects

[Recipe 01](./01-oauth-setup.md) showed the in-process mutex + database CAS pattern. That covers 95% of deployments.

The remaining 5% — multi-region Cloudflare Workers, Lambda@Edge with multiple concurrent invocations, multi-AZ deployments where database CAS still allows two workers to refresh in parallel — needs a **distributed lock** on top of the CAS. Cloudflare Durable Objects are the cheapest, fastest primitive for this on the Workers platform.

## The architecture

```
                        ┌────────────────────────┐
[Worker isolate A] ───▶│                        │
[Worker isolate B] ───▶│  Durable Object        │ ──▶ MELI /oauth/token
[Worker isolate C] ───▶│  per userId            │
                        │  (single-threaded)     │
                        └────────────────────────┘
                                    │
                                    ▼
                              [DO storage]
                              tokens + lock state
```

Every request for seller `X` routes to the same Durable Object instance (Cloudflare partitions by name → consistent hashing). DO instances are **single-threaded by design** — only one request at a time runs inside one. So the refresh logic that's `read → check expiry → refresh → write` runs as if it were single-threaded, even across millions of edge isolates.

## The Durable Object

```ts
// src/MeliTokenDO.ts
import {
  refreshTokens,
  type MeliOAuthTokens,
  type OAuthAppCredentials,
} from "@ar-agents/mercadolibre";

interface Env {
  MELI_APP_ID: string;
  MELI_APP_SECRET: string;
}

export class MeliTokenDO {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/get-access-token" && req.method === "POST") {
      const { userId } = (await req.json()) as { userId: number };
      const tokens = await this.ensureFresh(userId);
      return Response.json({ access_token: tokens.access_token });
    }
    if (url.pathname === "/seed" && req.method === "POST") {
      const { userId, tokens } = (await req.json()) as {
        userId: number;
        tokens: MeliOAuthTokens;
      };
      await this.state.storage.put(this.tokenKey(userId), tokens);
      return Response.json({ ok: true });
    }
    return new Response("not found", { status: 404 });
  }

  private tokenKey(userId: number): string {
    return `tokens:${userId}`;
  }

  private async ensureFresh(userId: number): Promise<MeliOAuthTokens> {
    // Single-threaded — no mutex needed inside a DO.
    const stored = await this.state.storage.get<MeliOAuthTokens>(
      this.tokenKey(userId),
    );
    if (!stored) throw new Error(`no_tokens_for_${userId}`);

    const now = Math.floor(Date.now() / 1000);
    if (stored.access_token_expires_at - now > 60) {
      return stored;
    }

    const app: OAuthAppCredentials = {
      clientId: this.env.MELI_APP_ID,
      clientSecret: this.env.MELI_APP_SECRET,
    };
    const refreshed = await refreshTokens(app, stored.refresh_token);
    await this.state.storage.put(this.tokenKey(userId), refreshed);
    return refreshed;
  }
}
```

## The OAuthTokenStore that calls it

```ts
// src/oauth-store.ts
import type { OAuthTokenStore, MeliOAuthTokens } from "@ar-agents/mercadolibre";

interface Env {
  MELI_TOKEN_DO: DurableObjectNamespace;
}

export function createDurableObjectOAuthStore(env: Env): OAuthTokenStore {
  return {
    async read(userId) {
      const id = env.MELI_TOKEN_DO.idFromName(`user:${userId}`);
      const stub = env.MELI_TOKEN_DO.get(id);
      const r = await stub.fetch("https://do/get-access-token", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      if (!r.ok) return null;
      const { access_token } = (await r.json()) as { access_token: string };
      // We only get the access_token back — the DO holds refresh state.
      // Construct a minimal tokens object for the lib's caller.
      return {
        access_token,
        refresh_token: "(held-by-DO)",
        access_token_expires_at: Math.floor(Date.now() / 1000) + 21_600,
        scope: "offline_access read write",
        user_id: userId,
        token_type: "bearer",
      };
    },
    async write() {
      // No-op — the DO owns the write side. The lib's `ensureAccessToken`
      // calls write() after a refresh; in this architecture the DO already
      // wrote during its own `ensureFresh` call.
    },
  };
}
```

## The Worker

```ts
// src/index.ts
import { MeliClient, getItem } from "@ar-agents/mercadolibre";
import { createDurableObjectOAuthStore } from "./oauth-store";
import { MeliTokenDO } from "./MeliTokenDO";

interface Env {
  MELI_TOKEN_DO: DurableObjectNamespace;
  MELI_APP_ID: string;
  MELI_APP_SECRET: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const userId = 12345;
    const client = new MeliClient({
      auth: {
        kind: "oauth",
        userId,
        app: {
          clientId: env.MELI_APP_ID,
          clientSecret: env.MELI_APP_SECRET,
        },
        store: createDurableObjectOAuthStore(env),
      },
    });
    const item = await getItem(client, "MLA1402155766");
    return Response.json(item);
  },
};

export { MeliTokenDO };
```

## `wrangler.toml`

```toml
name = "meli-edge"
main = "src/index.ts"
compatibility_date = "2026-05-09"

[[durable_objects.bindings]]
name = "MELI_TOKEN_DO"
class_name = "MeliTokenDO"

[[migrations]]
tag = "v1"
new_classes = ["MeliTokenDO"]

[vars]
MELI_APP_ID = "..."
# MELI_APP_SECRET via `wrangler secret put MELI_APP_SECRET`
```

## What this gets you

- **Zero `refresh_token_reused` events** under any concurrency. The DO partitioner guarantees one instance per user; the DO runtime guarantees single-threaded execution inside.
- **Sub-millisecond access-token reads** for cached tokens — the DO storage is local to the DO's region.
- **No external Redis dependency** — DOs are part of the Workers platform.
- **Free tier** covers 1M DO requests/month.

## When NOT to use this

If you're not already on Cloudflare Workers, the in-process mutex + Postgres CAS pattern from [Recipe 01](./01-oauth-setup.md) is simpler, cheaper, and good enough. DOs only beat Postgres CAS at extreme concurrency (many concurrent isolates per user) — most apps will never hit that.
