# Defensive npm typosquats

Three scopes that look almost identical to `@ar-agents` and would
otherwise be free for a malicious actor to register and ship a
backdoored package under:

- `@ar-agent` (singular)
- `@ar.agents` (dot variant)
- `@ar_agents` (underscore variant)

## Why

A developer who typos the scope name during `npm install` would
otherwise pull a stranger's package. The swarm security audit
flagged this as a "register before someone else does" gap in the
posture. Squatting them ourselves and pointing at the canonical scope
closes the gap for $0/year (npm orgs are free for OSS).

## What to publish

Each scope publishes a single placeholder package whose only
behavior is throwing a clear message:

```ts
throw new Error(
  'You meant `@ar-agents`, not `@ar-agent`. The canonical scope is ' +
  '`@ar-agents` (plural). Install instead: `pnpm add @ar-agents/<package>`. ' +
  'See https://ar-agents.ar.',
);
```

The published package's README also points at the canonical scope.

## Setup steps (Naza, one-time, ~3 minutes)

For EACH of the three scopes:

1. Go to <https://www.npmjs.com/org/create>.
2. Pick the "Free Open Source" plan.
3. Type the scope name (without the `@`): `ar-agent`, `ar.agents`, `ar_agents`.
4. Add `naza-ar` as the sole member with Owner role.
5. Done. The org now exists; nobody else can claim that scope.

## Then publish the stub

This directory has a `pkg/` subdirectory ready to publish. After all
three orgs exist:

```sh
cd internal/squats/pkg
for scope in ar-agent ar.agents ar_agents; do
  # rewrite the name in package.json, then publish
  jq ".name = \"@${scope}/install\"" package.json > package.json.new
  mv package.json.new package.json
  npm publish --access public
done
```

(Or just publish under one canonical package name like `index` per
scope — the package name doesn't matter for the squat; what matters
is that the SCOPE is owned.)

## Why three variants

- `@ar-agent` — common pluralization typo (`ar-agents` → `ar-agent`).
- `@ar.agents` — dot is a valid npm scope character; some tools
  auto-correct hyphens to dots in URL-like contexts.
- `@ar_agents` — underscore variant; common in Python-influenced
  copy-paste mistakes.
