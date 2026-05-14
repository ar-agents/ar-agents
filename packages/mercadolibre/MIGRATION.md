# Migration guide — from `mercadolibre/nodejs-sdk` to `@ar-agents/mercadolibre`

> The official `mercadolibre/nodejs-sdk` was archived in February 2022. The maintainer-side notice on the repo is "we will stop maintaining our SDKs."
>
> This is the side-by-side guide to migrate. Most callers can switch in 10–20 lines.

## Why migrate

The archived SDK still serves ~37 weekly downloads as of mid-2026. It works, but:

- No types (plain JavaScript, no `.d.ts`).
- No retry / rate-limit / OAuth-coalescing logic — a naïve `fetch` wrapper.
- No webhook parsing / `/myfeeds` replay.
- No agent tools.
- Last commit October 2021. Open issues since then go unanswered.
- Ships dependencies that have CVEs unpatched since 2022.

`@ar-agents/mercadolibre` is a faithful reimplementation with the production-grade primitives the archived SDK never had.

## Side-by-side cheatsheet

### Setup

**Before** (`mercadolibre`):

```js
const meli = require('mercadolibre');
const ml = new meli.Meli(APP_ID, SECRET_KEY, ACCESS_TOKEN);
```

**After** (`@ar-agents/mercadolibre`):

```ts
import { MeliClient } from '@ar-agents/mercadolibre';

const client = new MeliClient({
  auth: { kind: 'bearer', accessToken: ACCESS_TOKEN },
});
```

For the OAuth flow (where the archived SDK forced you to track the refresh token yourself):

```ts
import { MeliClient, type OAuthTokenStore } from '@ar-agents/mercadolibre';

const store: OAuthTokenStore = {
  async read(userId)  { /* SELECT */ },
  async write(userId, tokens) { /* UPSERT with CAS, see Cookbook 01 */ },
};

const client = new MeliClient({
  auth: {
    kind: 'oauth',
    userId: 123_456_789,
    app: { clientId: APP_ID, clientSecret: SECRET_KEY },
    store,
  },
});
```

### `getItem`

**Before:**

```js
ml.get('/items/MLA1402155766', function (err, response) {
  if (err) return console.error(err);
  console.log(response.title);
});
```

**After:**

```ts
import { getItem } from '@ar-agents/mercadolibre';

const item = await getItem(client, 'MLA1402155766');
console.log(item.title);
```

You get full TypeScript types on `item` (~40 fields, all documented). No need to memorize the response shape.

### `searchItems`

**Before:**

```js
ml.get('/sites/MLA/search', { q: 'yerba amanda' }, function (err, response) {
  console.log(response.results);
});
```

**After:**

```ts
// Read-side helpers for public catalog search are exported per-domain.
// For seller-side items, use searchSellerItems / iterateSellerItems.
import { searchSellerItems, iterateSellerItems } from '@ar-agents/mercadolibre';

const page = await searchSellerItems(client, sellerId, { status: 'active' });

// Or stream all (handles scroll_id for you):
for await (const id of iterateSellerItems(client, sellerId, { status: 'active' })) {
  console.log(id);
}
```

### `answerQuestion`

**Before:**

```js
ml.post('/answers', {
  question_id: 12345,
  text: 'Sí, hay stock.',
}, function (err, response) {});
```

**After:**

```ts
import { answerQuestion } from '@ar-agents/mercadolibre';

await answerQuestion(client, { question_id: 12345, text: 'Sí, hay stock.' });
```

### Refreshing tokens

**Before** (you had to remember to refresh + retry on 401):

```js
ml.refreshAccessToken(function (err, response) {
  if (err) return;
  ml.access_token = response.access_token;
  ml.refresh_token = response.refresh_token;
  // re-issue your call
});
```

**After:**

OAuth refresh happens automatically when you use `auth.kind === 'oauth'`. The lib coalesces concurrent refreshes via a per-`userId` mutex (see [Cookbook 01](./cookbook/01-oauth-setup.md) for the cross-process CAS pattern).

You don't write refresh logic. You write your `OAuthTokenStore` once, and the lib drives.

### Webhooks

**Before:** You parse the payload yourself. The archived SDK has no webhook helper.

**After:**

```ts
import { parseWebhook, extractResourceId } from '@ar-agents/mercadolibre';

export async function POST(req: Request) {
  const body = await req.json();
  const evt = parseWebhook(body, { expectedTopics: ['orders_v2'] });
  const orderId = extractResourceId(evt);
  // ...
}
```

### `/myfeeds` replay (the one your archived SDK doesn't cover)

```ts
import { iterateAllMissedFeeds } from '@ar-agents/mercadolibre';

// Catch up after >5min outage, deduped by (topic, resource, sent):
for await (const event of iterateAllMissedFeeds(client, APP_ID, ['orders_v2', 'questions'])) {
  await processEvent(event);
}
```

The archived SDK doesn't have this. You'd have to write the loop + the dedup yourself.

## Mechanical migration steps

1. `pnpm remove mercadolibre` (or `npm uninstall`).
2. `pnpm add @ar-agents/mercadolibre`.
3. Replace your imports:
   - `require('mercadolibre')` → `import { MeliClient, ... } from '@ar-agents/mercadolibre'`.
4. Replace `new Meli(APP_ID, SECRET, TOKEN)` with `new MeliClient({ auth: { kind: 'bearer', accessToken: TOKEN } })`.
5. Replace `ml.get(path, qs, cb)` calls with the typed domain helpers (`getItem`, `searchSellerItems`, etc.) — see the cheatsheet above.
6. Convert callbacks to `await`.
7. Run your test suite. The new lib has stricter TypeScript types so the compiler will catch most missed conversions.

For OAuth users, also implement an `OAuthTokenStore`. See [Cookbook 01](./cookbook/01-oauth-setup.md) for the production-grade pattern with database-level CAS.

## What NOT to migrate

- If you used the archived SDK as a thin REST proxy (e.g., from a frontend), don't migrate. Use `fetch` directly + your own auth — the value of `@ar-agents/mercadolibre` is in the agent layer + production primitives, not the wrapper.
- If you have a mature in-house client wrapping `fetch`, you don't have to migrate. Cherry-pick the parts you want — the [retry classifier](./src/retry.ts) and the [OAuth mutex](./src/oauth.ts) are MIT-licensed.

## Coverage parity matrix

| Domain | Archived SDK | `@ar-agents/mercadolibre` |
| --- | --- | --- |
| Items get/search | Manual `ml.get(path)` | Typed `getItem()`, `searchSellerItems()`, `iterateSellerItems()`, `multigetItems()` (auto-chunks) |
| Items create/update | Manual | Typed `createItem()`, `updateItem()`, `pauseItem()`, `closeItem()`, `relistItem()` |
| Categories | Manual | `predictCategory()`, `discoverDomain()`, `getDomainTechnicalSpecs()`, `categorizeAndPlan()` |
| Questions | Manual | `listQuestions()`, `answerQuestion()`, `blacklistAsker()`, `classifySpam()` |
| Orders + Packs | Manual | `searchOrders()`, `getOrder()`, `getOrderBillingInfo()`, `getPack()`, `partitionByPack()` |
| Claims | Manual | `searchClaims()`, `defendClaim()` (the 2-day SLA flow) |
| Shipments | Manual | `getShipment()`, `getShipmentHistory()`, `fetchLabelsBlob()` (PDF/ZPL) |
| Reputation | Manual | `getSellerReputation()`, `evaluateReputationAlerts()`, `monitorReputation()` (async generator) |
| Promotions | Not covered | `listPromotionCandidates()`, `optInPromotion()`, `autoOptInPromotions()` (margin guard) |
| Webhooks | Not covered | `parseWebhook()`, `replayMissedFeeds()`, `iterateAllMissedFeeds()` |
| OAuth refresh-coalescing | Not covered | Built in (per-userId mutex + CAS-friendly store interface) |
| Per-seller rate limit | Not covered | Token bucket, idle GC |
| Idempotent-only retry | Not covered | Default classifier; `Retry-After` HTTP-date support |
| Telemetry hooks | Not covered | `onRequest` / `onResponse` / `onRetry` / `onRateLimitWait` |
| AI SDK 6 tools | N/A (didn't exist) | 14 tools at `/ai-sdk` subpath, HITL-gated where destructive |
| ACP feed | N/A | Opt-in feed at `/feed` subpath |
| MCP server | N/A | Bundled in `@ar-agents/mcp` |

If you find a gap not listed, file an issue at [github.com/ar-agents/ar-agents](https://github.com/ar-agents/ar-agents/issues) — the maintainer triages within 7 days.
