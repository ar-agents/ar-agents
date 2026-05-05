# Contributing to ar-agents

Thanks for your interest in contributing. This monorepo welcomes PRs that add new tools, fix bugs in existing packages, or improve documentation — especially the agent-targeted docs (`AGENTS.md` files), which are the surface most agents pick up first when deciding whether to use a package.

## Quick start

```bash
git clone https://github.com/ar-agents/ar-agents
cd ar-agents
pnpm install
pnpm test       # run tests across all packages
pnpm typecheck  # type-check all packages
pnpm build      # build all packages
```

Requires Node 20+ and pnpm 10+.

## Repo layout

- `packages/*` — publishable npm packages (each is `@ar-agents/<name>`)
- `apps/*` — Next.js reference apps that dogfood the packages
- `.changeset/*` — pending version bump descriptors (see "Versioning" below)

## Adding a new tool to an existing package

1. Implement the tool in `packages/<pkg>/src/tools.ts` (or a new file imported by it).
2. Write a description that an LLM can use to pick the tool correctly. Cover: WHEN to use, WHEN NOT TO, what the tool returns, side effects, constraints. The description IS the agent's UX.
3. Add tests under `packages/<pkg>/test/`. Use MSW to mock external HTTP calls; unit-test pure logic directly.
4. Update `packages/<pkg>/README.md` with the new tool in the "Tools" section.
5. Update `packages/<pkg>/AGENTS.md` with tool selection rules + the new tool's result schema.
6. Add a changeset (see below).

## Adding a new package

1. Copy the structure of `packages/identity` as a starting template.
2. Set `name` to `@ar-agents/<your-pkg>` in `package.json`.
3. Mirror the docs split: ship a `README.md` (for humans) and an `AGENTS.md` (for LLMs picking tools at runtime).
4. Add a changeset for the new package.
5. Update the root `README.md` packages table.

## Versioning

We use [Changesets](https://github.com/changesets/changesets) for monorepo version management.

When you make a user-facing change, add a changeset:

```bash
pnpm exec changeset
```

The CLI walks you through:
1. Which packages changed
2. What kind of bump (`patch` / `minor` / `major`)
3. A short description that becomes the changelog entry

Commit the generated `.changeset/*.md` file with your PR. When PRs land on `main`, our release workflow opens a PR that bumps versions and updates each package's `CHANGELOG.md`. Merging that PR triggers `npm publish`.

## Testing standards

- Vitest + MSW (where HTTP mocking is needed).
- Coverage thresholds enforced per-package (see each `vitest.config.ts`).
- Tests should cover happy path + every documented error path. If a `MercadoPagoError` subclass exists, there's a test that proves it's thrown when expected.

## TypeScript style

- `tsconfig.base.json` is strict, with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on. Don't loosen at the package level without a clear reason.
- Public API exports MUST have JSDoc. Internal helpers don't need it but benefit from short comments.
- Prefer named types over inline anonymous; agents reading the source pick up named types from LSP / type inspection.

## Documentation standards

- `README.md` is for human developers evaluating the package.
- `AGENTS.md` is for LLMs picking tools at runtime AND for agent authors integrating the package. Keep tables short and memorizable.
- Tool descriptions are the highest-leverage doc surface — write them carefully.
- Error messages should always be actionable: "X failed because Y, do Z to fix" rather than just "X failed".

## Conventional Commits (recommended, not enforced)

Use conventional commit prefixes when you can:

- `feat:` new feature or tool
- `fix:` bug fix
- `docs:` documentation only
- `test:` adding/updating tests
- `refactor:` non-behavior code change
- `chore:` repo maintenance

This makes the changelog easier to scan even before changesets renders it.

## Reporting bugs / proposing features

Open an issue at https://github.com/ar-agents/ar-agents/issues. Include:
- Package + version
- Minimal repro
- Expected vs actual behavior

For security issues, see [SECURITY.md](./SECURITY.md) instead — please don't open public issues.

## License

By contributing, you agree your contributions will be licensed under the MIT License.
