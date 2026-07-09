# Studio internal API contract (v1)

Studio is the conversational builder: idea to operating automated society. It orchestrates the public ar-agents.ar APIs; it owns only accounts, metering, and the mapping account -> society. Backend and frontend are built against this file. Change it deliberately.

Conventions: JSON everywhere. Account auth via `x-studio-token: stu_...` header. Errors: `{ ok: false, error: string }` with a proper status. All copy user-facing strings es-AR.

## Accounts

`POST /api/account` (no auth)
Creates an anonymous account. Response `201`:
`{ ok: true, accountId: string (uuid), token: "stu_..." }`
Token is returned exactly once (write-once capability, hash at rest). Client stores both in localStorage. Rate limit: 5/hour/IP.

`GET /api/account` (auth)
`{ ok: true, accountId, createdAt, usage: { month: "YYYYMM", inputTokens, outputTokens, costMicroUsd, priceMicroUsd }, cap: { monthlyCostMicroUsd, remainingMicroUsd }, society: SocietySummary | null }`
`priceMicroUsd = costMicroUsd * 5` (the would-be bill; nothing is charged in v1).

## Agent

`POST /api/agent` (auth)
Body: `{ messages: UIMessage[], stage?: "idea"|"validacion"|"spec"|"constitucion"|"operacion" }`
Streams an AI SDK v7 UI-message response (tool-calling agent). Before the model call: enforce the account cap (fail closed, 402 `{ ok:false, error:"cap" }` when exhausted). After: record token usage and cost per account (best-effort, never fails the request).
Model routing (config in `src/lib/models.ts`, all env-overridable):
- coach (default): `STUDIO_COACH_MODEL`, default OpenRouter `nvidia/nemotron-3-nano-30b-a3b:free` (needs `OPENROUTER_API_KEY`)
- build steps: `STUDIO_BUILD_MODEL`, default gateway `deepseek/deepseek-v4-flash` (needs `AI_GATEWAY_API_KEY`)
- fallback order: coach -> build -> `anthropic/claude-haiku-4.5`; skip any tier whose key env is missing; if none configured, return 503 `{ ok:false, error:"no_model_configured" }` (the UI shows setup instructions).
Agent tools (the model may call these; none of them constitute):
- `preview_society({ prompt })` -> POST `${ARAGENTS_BASE}/api/incorporate-preview` (public). Returns the draft + checklist. This is how a spec becomes concrete.
- `good_standing({ idOrUrl })` -> GET `${ARAGENTS_BASE}/api/registry/good-standing`.
- `my_society()` -> the account's SocietySummary or null.
- `research_web({ query })` -> Tavily search (`src/lib/research.ts`), only registered when `TAVILY_API_KEY` is set. 8s timeout, 5 results (title/url/snippet), never throws (degrades to a Spanish error string on any failure). When the key is absent the tool is not registered at all and the system prompt says live search is unavailable instead.
The system prompt (`src/coach/system-prompt.ts`, `buildSystemPrompt(stage, { webSearchAvailable })`): es-AR startup coach for automated societies; stages idea -> validacion -> spec -> constitucion -> operacion; honest about pre-law simulation status; pushes toward a concrete `preview_society` draft; never claims to file anything real. Composes the base coaching instructions with a compact digest of the coach corpus (`src/coach/corpus.ts`, the compiled form of the markdown files under `src/coach/corpus/`: lean startup method, distilled Paul Graham essay principles with source links, what makes a business automatable by agents, and Argentina-specific coaching context that is explicitly not legal advice). Constitution itself is NEVER model-initiated: the model tells the user to press the button.

## Society lifecycle

`POST /api/society/constitute` (auth)
Body: `{ draft: SocietyDraft, administrador: { nombre, cuit }, acepta102: true }` (the UI collects these in an explicit confirmation dialog; CUIT format-validated client and server side).
Server: requires the account to have no society yet (409 otherwise). Calls `${ARAGENTS_BASE}/api/incorporate-attested`. On success stores `studio:society:{accountId}` = `{ sessionId, denominacion, tipo, registryId, adminToken, gateToken, createdAt }` (custodial; tokens also returned ONCE in the response so the user can self-custody) and returns `{ ok: true, society: SocietySummary, credentials: { adminToken, gateToken }, formationPack: {...}, deploy: { oneClickUrl } }`. Rate limit 2/day/account.

`GET /api/society` (auth)
`{ ok: true, society: SocietySummary | null }`
SocietySummary: `{ sessionId, denominacion, tipo, registryId, createdAt, goodStanding: { state, score, rating } | null, suspended: boolean | null, pendingApprovals: number | null }` (the three nullables are live look-ups, null on upstream failure).

`GET /api/society/approvals` (auth)
Full pending list via upstream `GET /api/approvals/pending?society=...` with the stored admin token. `{ ok: true, approvals: [...] }`

`POST /api/society/approvals` (auth)
Body `{ id, approved: boolean }` -> upstream `POST /api/approvals/resolve` with stored adminToken and administrador nombre. Returns upstream result.

`POST /api/society/suspend` (auth)
Body `{ suspend: boolean, motivo?: string, acepta: true }` -> upstream `/api/suspender` or `/api/reanudar` with stored adminToken. The UI treats suspend as the red kill switch with a confirm step.

## Shared libs (backend owns; frontend never imports)

- `src/lib/account.ts`: mint/verify account tokens. Pattern copied from landing's capability-token (write-once `kv.set nx`, SHA-256 at rest, constant-time verify, in-memory fallback when KV unwired). Keys `studio:accounttoken:{accountId}`, profile `studio:account:{accountId}`.
- `src/lib/meter.ts`: `recordUsage(accountId, { inputTokens, outputTokens, model, costMicroUsd })` via `kv.incrby` on `studio:usage:{accountId}:m:{YYYYMM}:{field}`; `getUsage(accountId)`; `checkCap(accountId)` read-then-compare under a kv lock (copy landing's kv-lock pattern). Cap env `STUDIO_FREE_CAP_MICRO_USD`, default 500000 (0.50 USD of model cost, i.e. 2.50 USD at 5x price). Best-effort recording; fail-closed cap.
- `src/lib/models.ts`: pricing table (micro-USD per token, per model id) + `resolveModel(tier)` + `estimateCostMicroUsd(model, usage)`. Prices are config constants with a source comment; unknown model -> conservative highest price.
- `src/lib/aragents.ts`: typed fetch helpers for every upstream call, base `process.env.STUDIO_ARAGENTS_BASE ?? "https://ar-agents.ar"`, 10s timeouts, no retries on POSTs.

## Env (all optional; degrade gracefully)

`OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, `STUDIO_COACH_MODEL`, `STUDIO_BUILD_MODEL`, `STUDIO_FREE_CAP_MICRO_USD`, `STUDIO_ARAGENTS_BASE`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `TAVILY_API_KEY` (gates the `research_web` tool; free tier at tavily.com).
