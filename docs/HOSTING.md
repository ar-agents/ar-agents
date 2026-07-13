# Hosting: where a society's agent app runs

(ROADMAP.md M2-2.)

When a society is constituted in studio and then deployed, its agent app
(the `apps/sociedad-ia-starter` scaffold) runs as **its own Vercel project**,
not inside a shared, hosted multi-tenant runtime. A hosted multi-tenant
runtime was considered and rejected: a society's secrets (model key,
Mercado Pago, WhatsApp, AFIP cert, treasury off-ramp) and its signed audit
log stay isolated in that society's own project and environment instead of
living in a shared process alongside every other society's. Each society
therefore owns its own runtime, its own deploy history, and its own audit
log; studio itself never runs a society's agent loop, it only provisions,
configures, and observes it. This keeps studio as the ONE cockpit founders
use, per the architectural decision recorded in ROADMAP.md's M3 section
intro (owner-delegated 2026-07-09): the deployed society app stays a
headless runtime plus a minimal branded page, and founders operate every
society from studio, never from the raw deploy URL.

## Where the code lives

- `apps/studio/src/lib/vercel-provision.ts` -- the Vercel REST provisioning
  layer. All project creation, env var writes, deployments, and deploy-health
  reads go through this file. Its project name for a society is derived by
  `projectSlugFor` (a `soc-` prefix plus the society id, lowercased and
  cleaned to Vercel's allowed project-name characters).
- `apps/studio/src/app/api/society/deploy/route.ts` -- the `POST
  /api/society/deploy` route that decides which of the two modes below to
  use and drives `vercel-provision.ts` accordingly.

## The two deploy modes

The mode is decided by whether the `VERCEL_PROVISION_TOKEN` environment
variable is set on studio's own deployment.

### Provisioned mode (token set)

Studio calls the Vercel REST API directly:

1. Creates the society's own Vercel project (`provisionSocietyApp`).
2. Sets its initial env vars as encrypted project env (`target: production`).
3. Triggers the first deployment and polls it to a terminal state
   (`READY`, `ERROR`, `CANCELED`, or `BLOCKED`).
4. Persists the resulting project name and URL against the stored society,
   so `GET /api/society` and the studio cockpit can read it back.

Env vars injected in this mode: `SOCIETY_ID`, `SOCIETY_GATE_TOKEN`,
`AR_AGENTS_API_BASE`, `AGENT_API_KEY`, `STUDIO_STATUS_TOKEN`,
`AUDIT_HMAC_SECRET`, `SOCIEDAD_IA_DENOMINACION`.

### Manual mode (no token)

Studio has no capability to call the Vercel API on the founder's behalf, so
it responds with a one-click Vercel deploy URL (`https://vercel.com/new/clone`
pre-filled with the source repo and the env var names) plus a plain text env
file the human pastes into that project's Environment Variables once it
exists.

Env vars listed for the human to paste in this mode: `SOCIETY_ID`,
`SOCIETY_GATE_TOKEN`, `AR_AGENTS_API_BASE`, `AGENT_API_KEY`,
`SOCIEDAD_IA_DENOMINACION`.

In both modes, `AGENT_API_KEY` is minted fresh (32 random bytes, hex) once
per deploy call and returned exactly once in the response; studio never
stores it itself, matching the self-custody shape of the constitute route's
admin/gate tokens.

## What is automated vs still manual

Automated, provisioned mode only:

- Vercel project creation (`provisionSocietyApp`).
- Initial env var injection at deploy time, and later business-credential
  env var injection (model key, Mercado Pago, WhatsApp, AFIP, treasury) via
  `setSocietyCredentialEnvVars`, which the credentials wizard
  (`apps/studio/src/lib/credentials.ts` and its routes) calls after the
  first deploy exists.
- Redeploys so newly-set env vars take effect
  (`redeploySocietyApp`, `triggerRedeploy`).
- Deploy-health reads for the studio cockpit
  (`getLatestDeployment`, `getProjectProductionDomain`).

Still manual:

- In manual mode, the human pastes the env file into the Vercel project
  themselves; studio never learns whether that happened.
- In manual mode, the deploy never gets a studio cockpit: studio has no
  project it can read status from or write a `STUDIO_STATUS_TOKEN` to,
  since it never created that project. This matches the limitation already
  documented for ROADMAP.md's M3-2 (studio shows the living society):
  only provisioned-mode deploys get a cockpit.

## Source repo and ref

Every society's agent app, in both modes, deploys from the same public
scaffold in this monorepo:

- Repo: `ar-agents/ar-agents` (`GITHUB_REPO` in `vercel-provision.ts`)
- Root directory: `apps/sociedad-ia-starter` (`ROOT_DIRECTORY`)
- Git ref: `main` (`GIT_REF`)

## Env the operator (studio) needs

- `VERCEL_PROVISION_TOKEN` -- the capability gate. A scoped Vercel API
  token created at vercel.com/account/settings/tokens. Absent, every
  provisioning function in `vercel-provision.ts` returns `null` (a distinct
  signal from `{ ok: false }`, meaning "not configured", not "failed"), and
  the deploy route falls back to manual mode.
- `VERCEL_TEAM_ID` (optional) -- when set, every Vercel API call is scoped
  to that team via a `teamId` query parameter.
