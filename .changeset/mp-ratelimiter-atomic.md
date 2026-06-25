---
"@ar-agents/mercadopago": patch
---

Make `VercelKVRateLimiter` token acquisition atomic (DeepSec MEDIUM, `rate-limit-bypass`).

`acquire()` / `tryAcquire()` previously did a non-atomic read → refill → check → decrement → write across separate KV calls, so concurrent callers could all observe the same lone token and each succeed — bypassing the global limit. Acquisition now runs a single server-side Upstash Lua `EVAL` script, so the refill-and-consume is atomic across all serverless instances and the limit holds exactly (no over-spend window). `learnFromHeaders` uses the same atomic primitive for its adaptive clamp. Behavior and the public API are unchanged.
