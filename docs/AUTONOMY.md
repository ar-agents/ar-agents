# Autonomy contract

This repo improves itself. Agent sessions (scheduled cloud routines or local sessions) execute `ROADMAP.md` continuously without being prompted. This file is the contract every such session must follow. It is written for agents; humans should read it too.

## The loop

Each run:

1. **Sync.** `git fetch origin main`. Create a fresh worktree/branch off `origin/main`. Never work in an existing checkout; other sessions may own it.
2. **Pick.** Read `ROADMAP.md`. Take the highest-priority item whose `status: ready` and whose acceptance criteria you can verify with the tools available. One item per run. If the top item is too large for one run, split it into smaller `ready` items in a roadmap-only PR instead of starting it.
3. **Execute.** Do the work. Prefer boring, verifiable increments over ambitious partial ones. Reuse existing libs and patterns; read neighboring code first.
4. **Verify.** All of these must pass locally before any PR: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm run check-manifests`. If you changed a package's tools, run `pnpm regen-manifests`. If you touched `apps/landing` or `apps/studio`, run that app's own test suite too.
5. **Ship.** One PR per item. When CI is green, merge (squash) and delete the branch. In the same PR, update the item's `status` in `ROADMAP.md` (`done`, with date and PR number) and add any follow-up items discovered.
6. **Record.** If you learned something durable (a landmine, a decision), append it to the item's roadmap entry, not to a new doc.

## Hard rules (public repo)

- This is a PUBLIC repository. Neutral wording everywhere: code, comments, commit messages, PR bodies. No competitive strategy language. No em dashes in text you add.
- NEVER `git add -A` or `git add -u`. Stage explicit paths only. `internal/` is gitignored and must stay untracked.
- Before committing, grep the staged diff for real PII and for non-neutral strategy terms. Fixtures use fictional identities only (CUIT 20-12345678-6, Juan Perez, Calle Falsa 123). CI enforces the PII part; do not rely on it.
- Secrets live in Vercel env vars. Never commit, echo, or log them. Reference by name.

## Stop and escalate

Leave the PR open (or the item annotated `status: blocked` with a reason) instead of proceeding when the work requires any of:

- New secrets or env vars that do not exist yet.
- Moving money, charging users, or changing prices.
- Publishing packages to npm, or any release.
- Deleting or migrating user data.
- Legal claims, regulatory filings, or anything sent to third parties.
- Changing this file, `ROADMAP.md` priorities (order), or pricing in `docs/NORTH-STAR.md`.

A human (the repo owner) unblocks these. Everything else, proceed.

## Economy

- Route bulk execution to smaller, faster models; reserve the strongest model for design, review, and integration judgment.
- A second agent reviews every non-trivial diff before merge (fresh context, instructed to refute).
- If a run finds nothing `ready`, run the maintenance sweep instead: dependency updates within semver, flaky tests, doc drift against code, coverage of untested API routes. Then add what you found as roadmap items.

## Cadence

The cloud routine runs on a schedule (see the routine definition; currently every 6 hours). Local sessions may run the same loop at any time; the worktree rule and the one-item rule prevent collisions. If two runs collide on the same item anyway, the second one abandons (delete worktree, no PR).
