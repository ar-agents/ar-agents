# Agents: start here

This repo improves itself. If you are an agent session working on this repo:

1. Read `docs/AUTONOMY.md` (the contract: loop, hard rules, escalation) before touching anything.
2. Take work from `ROADMAP.md` only, topmost `ready` item, one per run.
3. The vision every change must serve is `docs/NORTH-STAR.md`.

Ground rules that bite: public repo (neutral wording, no em dashes in added text), never `git add -A`, `internal/` stays untracked, fictional PII only in fixtures, verify with `pnpm build && pnpm typecheck && pnpm test && pnpm run check-manifests` before any PR.

Layout: `packages/*` = 37 published `@ar-agents/*` npm packages. `apps/landing` = ar-agents.ar (marketing + all public APIs). `apps/studio` = the conversational society builder. `apps/sociedad-ia-starter` = the scaffold a created society starts from. `tools/arg-verify` = offline verifier (mirror any change to `apps/landing/public/arg-verify.mjs`).
