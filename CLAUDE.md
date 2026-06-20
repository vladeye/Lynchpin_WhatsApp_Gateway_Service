# Project conventions

## Git workflow: always use PRs

Do **not** commit directly to `main`. For every change:

1. Create a feature branch off `main` (e.g. `chore/ci-and-test-foundation`, `feat/baileys-runtime`).
2. Commit the work on that branch.
3. Push the branch and open a pull request with `gh pr create`.
4. Let CI run on the PR; merge only after it is green.

`main` stays clean — changes land via reviewed, CI-checked PRs.

> `gh` (GitHub CLI) is required for this flow.

## Stack

- Backend: Node.js 24 LTS, TypeScript, Fastify, Zod, Pino.
- Tooling: pnpm workspaces, Vitest, ESLint, `tsc --noEmit`.

## Scope

This service is a transport-only WhatsApp gateway: it manages WhatsApp Web
sessions (via Baileys), normalizes events, and exchanges them with n8n over
HTTP + signed webhooks. It contains **no business logic** (no patients,
invoices, AI, or Odoo concerns).
