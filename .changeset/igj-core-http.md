---
"@ar-agents/igj": minor
---

Migrate `LiveCkanFetcher` onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 #14).

IGJ's CKAN datastore lookups now run through the shared client: it keeps the per-request timeout it already had, **adds idempotent-GET retry** with backoff (the reads had none), and typed errors mapped back to `IgjError`. The CKAN action envelope is **schema-validated**, so a `success:true` body whose `result.records` isn't an array now throws instead of being coerced into an empty result set; CKAN's own `success:false` errors still surface with their original message, and a non-200 still maps to `CKAN <status>`.

New `LiveCkanFetcherOptions.retry`. `baseUrl`/`fetch`/`timeoutMs`/`resourceIds` unchanged.
