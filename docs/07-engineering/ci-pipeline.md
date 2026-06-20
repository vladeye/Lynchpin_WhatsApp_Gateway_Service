# CI Pipeline

## Status

Active — `.github/workflows/ci.yml`.

## What it does

Runs on every push to `main` and on pull requests. A single `build` job on
`ubuntu-latest` with Node 24 + pnpm and a `postgres:16` service container:

```text
pnpm install --frozen-lockfile
Lint:      pnpm -r --if-present lint        (eslint)
Typecheck: pnpm -r --if-present typecheck   (tsc --noEmit)
Test:      pnpm -r --if-present test        (vitest)
Build:     pnpm -r --if-present build       (admin-web vite build)
```

`DATABASE_URL` points at the Postgres service, so the repository integration
tests (`test/repository.integration.test.ts`) run migrations and exercise the
SQL. Without a database (e.g. locally) those tests skip via `describe.skipIf`.

## Conventions

- Never commit to `main`; branch → PR → green CI → merge (see repo `CLAUDE.md`).
- The lockfile is committed; CI uses `--frozen-lockfile`.

## See also

- [Gateway Accounts & Baileys Runtime](gateway-accounts-module.md)
