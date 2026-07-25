# Contributing to GovCore

GovCore is a pnpm-workspace TypeScript monorepo. This document covers local
setup, day-to-day workflow, and the conventions that keep the workspace
consistent across `lib/*` (shared libraries) and `artifacts/*` (deployable
apps).

## Prerequisites

- Node.js 24
- pnpm (version pinned in `packageManager` in the root `package.json` —
  install via `corepack enable`)
- PostgreSQL 16 (a `DATABASE_URL` connection string is required for `lib/db`
  and the API server)

## Getting started

```bash
pnpm install
pnpm run typecheck
```

Common workspace scripts (see `replit.md` for the authoritative list):

```bash
pnpm --filter @workspace/api-server run dev     # API server, port 5000
pnpm run typecheck                              # full workspace typecheck
pnpm run build                                  # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen   # regenerate clients from openapi.yaml
npx tsx tests/engines/<name>.test.ts            # run an engine's logic tests
```

## Repository layout

- `lib/` — shared libraries (`db`, `api-spec`, `api-zod`, `api-client-react`)
- `artifacts/` — deployable apps (`api-server`, `govcore` frontend,
  `mockup-sandbox`)
- `tests/engines/` — database-free tests for the rules, forms, notifications,
  and documents engines
- `scripts/` — workspace maintenance scripts

Source-of-truth files — never hand-edit their generated output:

| Source of truth | Generated into |
|---|---|
| `lib/db/src/schema/` | Drizzle types, migrations |
| `lib/api-spec/openapi.yaml` | `lib/api-zod`, `lib/api-client-react` |

If you change `openapi.yaml`, run
`pnpm --filter @workspace/api-spec run codegen` and then
`pnpm run typecheck:libs` in the same change — Orval's `clean` step wipes the
generated `dist/` folders, and the API server/frontend will report confusing
`TS6305` errors until they're rebuilt.

## Branching and commits

- Branch from `main`: `feat/<short-description>`, `fix/<short-description>`,
  `chore/<short-description>`.
- Prefer small, reviewable PRs scoped to one concern.
- Write commit messages that explain *why*, not just *what*, especially for
  changes to engines (`rules`, `forms`, `notifications`, `documents`) where
  behavior is easy to get subtly wrong — see `tests/engines/README.md` for
  the kinds of bugs that have bitten this codebase before.

## Before opening a PR

Run, in order:

```bash
pnpm run lint
pnpm run typecheck
npx tsx tests/engines/rules.test.ts
npx tsx tests/engines/forms.test.ts
npx tsx tests/engines/notifications.test.ts
npx tsx tests/engines/documents.test.ts
pnpm run build
```

These checks run in CI (see `.github/workflows/ci.yml`); running them first
avoids a slow feedback loop.

## Database changes

Schema changes go in `lib/db/src/schema/` (one file per table). See
`lib/db/MIGRATIONS.md` for the migration workflow — schema edits need a
generated migration committed alongside them for anything beyond local dev.

## Code review expectations

- At least one approval from a `CODEOWNERS`-designated reviewer for the area
  touched.
- Engine changes (rules/forms/notifications/documents) should come with a
  matching addition to `tests/engines/` when behavior changes, per the
  "Coverage" table in `tests/engines/README.md`.
- Don't hand-edit anything under a package's `dist/` or the API client
  generated output — fix the source and regenerate.

## Reporting bugs / requesting features

Use the issue templates under `.github/ISSUE_TEMPLATE/`. For security issues,
do **not** open a public issue — see `SECURITY.md`.
