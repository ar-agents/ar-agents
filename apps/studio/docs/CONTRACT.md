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
SocietySummary: `{ sessionId, denominacion, tipo, registryId, createdAt, goodStanding: { state, score, rating } | null, suspended: boolean | null, pendingApprovals: number | null, deploy: { projectName, url, deployedAt } | null }` (the three middle nullables are live look-ups, null on upstream failure; `deploy` is null until `POST /api/society/deploy` provisions successfully -- see below).

`GET /api/society/approvals` (auth)
Full pending list via upstream `GET /api/approvals/pending?society=...` with the stored admin token. `{ ok: true, approvals: [...] }`

`POST /api/society/approvals` (auth)
Body `{ id, approved: boolean }` -> upstream `POST /api/approvals/resolve` with stored adminToken and administrador nombre. Returns upstream result.

`POST /api/society/suspend` (auth)
Body `{ suspend: boolean, motivo?: string, acepta: true }` -> upstream `/api/suspender` or `/api/reanudar` with stored adminToken. The UI treats suspend as the red kill switch with a confirm step.

`POST /api/society/deploy` (auth)
Deploys the society's own agent app (the `apps/sociedad-ia-starter` scaffold) from studio (ROADMAP M1-6). Requires the account to already have a society (404 otherwise). Rate limit 3/day/account. Always mints a fresh `AGENT_API_KEY` (32 random bytes, hex) and returns it exactly once (never stored). Two response shapes, decided by whether `VERCEL_PROVISION_TOKEN` is configured:
- No token (manual mode): `{ ok: true, mode: "manual", oneClickUrl, envFile, agentApiKey }`. `envFile` is a ready-to-paste `.env` string (`SOCIETY_ID`, `SOCIETY_GATE_TOKEN`, `AR_AGENTS_API_BASE`, `AGENT_API_KEY`). Nothing is persisted; studio never learns whether the human completed the click-through.
- Token set (provisioned mode): actually creates a Vercel project for the society, sets its production env vars, triggers the first deployment, and polls it to a terminal state (max ~4min). `{ ok: true, mode: "provisioned", projectName, url, deploymentState, agentApiKey }`. On success, `{ projectName, url, deployedAt }` is persisted against the stored society, so `SocietySummary.deploy` reflects it on subsequent `GET /api/society` calls. A provisioning failure responds `502 { ok: false, error: "deploy_failed", detail }`.

See `src/lib/vercel-provision.ts` for the Vercel REST API calls this makes.

`GET /api/society/activity` (auth)
The "sociedad en vivo" cockpit feed (ROADMAP.md M3-2). Requires an already-provisioned deploy to return live data (404 `sin_sociedad` only when the account has no society at all; a society with no deploy yet still returns `200` with every section `available: false`). Merges two independent look-ups:
- Vercel deployment health (`getLatestDeployment`, needs `VERCEL_PROVISION_TOKEN`).
- The deployed society app's own `GET /api/status` (see `apps/sociedad-ia-starter`), authenticated with a studio-issued `STUDIO_STATUS_TOKEN` machine credential (distinct from `AGENT_API_KEY`): client wiring, kill switch, pending approvals (public/redacted view), and the last ~20 entries of the signed audit log.
Response: `{ ok: true, deploy: { available, projectName, url, state }, society: { available, denominacion, version, uptimeSeconds }, clients: { available, statuses }, killSwitch: { available, suspended }, approvals: { available, pendingCount, items }, audit: { available, entries }, provisioning: boolean }`. Every section is independently nullable/`available: false` on its own failure. `provisioning: true` means this call just backfilled a missing `STUDIO_STATUS_TOKEN` and triggered a redeploy; the `/api/status`-derived sections are skipped that one call since the deploy carrying the new token/code has not landed yet. Rate limit 120/hour/account (fails open).

`STUDIO_STATUS_TOKEN` provisioning: minted (32 random bytes, hex) by `POST /api/society/deploy` in provisioned mode alongside `AGENT_API_KEY`, set as one of the project's env vars, and persisted to `StoredSociety.statusToken` (never returned in the deploy response). For a society deployed before this existed, `GET /api/society/activity` backfills it lazily on first read via `setSocietyCredentialEnvVars` + a fire-and-forget `triggerRedeploy`. Manual-mode deploys never get one (studio never learns the project exists).

## Shared libs (backend owns; frontend never imports)

- `src/lib/account.ts`: mint/verify account tokens. Pattern copied from landing's capability-token (write-once `kv.set nx`, SHA-256 at rest, constant-time verify, in-memory fallback when KV unwired). Keys `studio:accounttoken:{accountId}`, profile `studio:account:{accountId}`.
- `src/lib/meter.ts`: `recordUsage(accountId, { inputTokens, outputTokens, model, costMicroUsd })` via `kv.incrby` on `studio:usage:{accountId}:m:{YYYYMM}:{field}`; `getUsage(accountId)`; `checkCap(accountId)` read-then-compare under a kv lock (copy landing's kv-lock pattern). Cap env `STUDIO_FREE_CAP_MICRO_USD`, default 500000 (0.50 USD of model cost). `getUsage` also returns `priceMicroUsd`, the estimated bill (`costMicroUsd` times the deployment's pricing factor, env `STUDIO_PRICE_MULTIPLIER`, default 5, server-only, never disclosed on any public surface). Best-effort recording; fail-closed cap.
- `src/lib/models.ts`: pricing table (micro-USD per token, per model id) + `resolveModel(tier)` + `estimateCostMicroUsd(model, usage)`. Prices are config constants with a source comment; unknown model -> conservative highest price.
- `src/lib/aragents.ts`: typed fetch helpers for every upstream call, base `process.env.STUDIO_ARAGENTS_BASE ?? "https://ar-agents.ar"`, 10s timeouts, no retries on POSTs.
- `src/lib/vercel-provision.ts`: `provisionSocietyApp({ name, envVars })` -- creates a Vercel project for a society's agent app, sets its env vars, triggers + polls the first deployment. `getLatestDeployment(projectName)` -- the project's most recent deployment state (deploy-health read, no polling). `triggerRedeploy(projectName)` -- fires a fresh deployment WITHOUT polling to a terminal state (unlike `redeploySocietyApp`), for a read endpoint that must return quickly. All return `null` (no capability) when `VERCEL_PROVISION_TOKEN` is unset. 10s timeouts, no retries on POSTs, scoped to `VERCEL_TEAM_ID` when set.

## Env (all optional; degrade gracefully)

`OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, `STUDIO_COACH_MODEL`, `STUDIO_BUILD_MODEL`, `STUDIO_FREE_CAP_MICRO_USD`, `STUDIO_PRICE_MULTIPLIER` (the deployment's pricing factor, default 5, server-only), `STUDIO_ARAGENTS_BASE`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `TAVILY_API_KEY` (gates the `research_web` tool; free tier at tavily.com), `VERCEL_PROVISION_TOKEN`, `VERCEL_TEAM_ID` (gate provisioned society deploys).
