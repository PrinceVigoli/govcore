# Development

## Prerequisites

- Node.js 24
- pnpm (via corepack: `corepack enable && corepack prepare pnpm@10.26.1 --activate`)
- A Postgres database (for anything that touches `DATABASE_URL` -- not
  needed for the database-free engine tests)

## Setup

```bash
git clone https://github.com/PrinceVigoli/govcore.git
cd govcore
pnpm install
```

## Everyday commands

| Command                                         | What it does                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm --filter @workspace/api-server run dev`   | Run the API server (port 5000)                                          |
| `pnpm run typecheck`                            | Full workspace typecheck (`lib/*` build + every app)                    |
| `pnpm run typecheck:libs`                       | Just `tsc --build` across `lib/*`                                       |
| `pnpm run lint` / `pnpm run lint:fix`           | ESLint across the repo                                                  |
| `pnpm run format` / `pnpm run format:check`     | Prettier                                                                |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate `lib/api-zod` and `lib/api-client-react` from `openapi.yaml` |
| `npx tsx tests/engines/<suite>.test.ts`         | Run one engine's logic tests (no `DATABASE_URL` needed)                 |
| `pnpm --filter @workspace/db run push`          | Push DB schema changes (dev only)                                       |
| `pnpm run build`                                | Typecheck, then build every package                                     |

## Running the engine tests

Nine suites live in `tests/engines/`, each a dependency-free harness (no test
framework, just `check()`/`t()` assertion helpers) pinning down the pure
decision logic inside an engine:

```bash
npx tsx tests/engines/rules.test.ts
npx tsx tests/engines/forms.test.ts
npx tsx tests/engines/notifications.test.ts
npx tsx tests/engines/documents.test.ts
npx tsx tests/engines/auth.test.ts
npx tsx tests/engines/authorization.test.ts
npx tsx tests/engines/search.test.ts
npx tsx tests/engines/integrations.test.ts
npx tsx tests/engines/reports.test.ts
```

Each exits non-zero on failure, so they work in CI or a pre-commit hook
as-is. See `tests/engines/README.md` for what each suite covers and why, and
`docs/deployment.md` for which of these `.github/workflows/ci.yml` currently
runs.

## Gotchas worth knowing up front

These are maintained in full in `replit.md`; a few that bite most often
during day-to-day development:

- **Codegen is two-way coupled.** Adding endpoints to `openapi.yaml` without
  rerunning `pnpm --filter @workspace/api-spec run codegen` leaves the
  frontend with no hooks for them.
- **After codegen, run `pnpm run typecheck:libs`.** Orval's `clean` step
  wipes the generated packages' `dist/`; until rebuilt, other packages
  report a `TS6305` error that looks like unrelated breakage.
- **Express/wouter route order matters.** More specific paths
  (`/forms/:id/fill`, `/rules/evaluate`, `/documents/verify/:uuid`,
  `/notifications/history`) must be declared before their more general
  siblings (`/forms/:id`, `/rules/:id`, `/documents/:id`,
  `/notifications/:id`), or the general route swallows them.
- **The rules engine compares strictly** -- `"5"` never equals `5`. Coerce
  numeric input before storing a condition value.
- **`isEmpty(false)` is `false`.** Never pre-seed a required
  checkbox/switch with `false`; it would pass validation as if answered.
- **`artifacts/govcore`'s Vite build needs `PORT` and `BASE_PATH` set at
  build time**, not just at runtime -- see `docs/deployment.md`.

## Project layout

```text
govcore/
  artifacts/
    api-server/     Express API (routes/, lib/ for app-tied engines)
    govcore/         React + Vite frontend (pages/ by feature, components/ui/)
    mockup-sandbox/  Design/prototype sandbox
  lib/
    api-spec/            OpenAPI source of truth
    api-zod/             Generated Zod schemas (do not hand-edit)
    api-client-react/    Generated TanStack Query hooks (do not hand-edit)
    db/                  Drizzle schema + connection
    search/              Search Engine (Sprint 2A)
    integration-engine/  Integration Engine (Sprint 2A)
    report-engine/       Report Engine (Book 10)
    queue-utils/         Shared backoff/stale-reclaim logic for queue workers
  scripts/           One-off/maintenance scripts
  tests/engines/     Database-free tests for the pure engine logic
```
