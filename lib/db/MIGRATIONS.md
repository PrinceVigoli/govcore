# Database migrations

`lib/db/src/schema/` is the source of truth for the schema. Until now the
only workflow wired up was `drizzle-kit push`, which diffs the schema
against a live database and applies the difference directly — no history,
no review artifact, and (with `--force`) it will silently accept
data-lossy changes. That's fine for a solo dev loop, but not for anything
with a review process or more than one environment.

## Two workflows, two purposes

| Command | What it does | When to use it |
|---|---|---|
| `pnpm --filter @workspace/db run push` | Diffs schema → live DB, applies directly | Local development only, on a throwaway/dev database |
| `pnpm --filter @workspace/db run generate` | Diffs schema → last migration, writes a new SQL file under `lib/db/migrations/` | Any time you change `lib/db/src/schema/` and intend to merge it |
| `pnpm --filter @workspace/db run migrate` | Applies pending migration files in order | Staging, production, CI-driven deploys |
| `pnpm --filter @workspace/db run migrate:status` | Reports whether the schema and migration history are in sync | CI check / pre-deploy sanity check |

**`push` is for local iteration only.** Anything intended to reach a shared
environment needs a generated migration file committed to the PR, so the
change is reviewable and repeatable.

## Workflow for a schema change

1. Edit the relevant file(s) in `lib/db/src/schema/`.
2. Run `pnpm --filter @workspace/db run generate`. Drizzle Kit will name the
   migration and write it to `lib/db/migrations/`.
3. **Read the generated SQL.** Drizzle's diffing is usually right but not
   infallible, especially for renames (it may see a rename as
   drop-then-add, which is destructive) — edit the SQL by hand if needed.
4. Commit the migration file alongside the schema change in the same PR.
5. On merge, run `pnpm --filter @workspace/db run migrate` against each
   target environment (or wire this into the deploy step — see below).

## Baseline

This workflow is being introduced onto an existing schema with 30+ tables
already live. Before the first `generate`, someone with access to a current
database needs to produce a **baseline migration** so history starts from
the schema as it exists today, rather than attempting to recreate it from
nothing:

```bash
pnpm --filter @workspace/db run generate
```

run once against the current schema with an empty `migrations/` folder
produces a single baseline migration representing everything that already
exists. That baseline should be reviewed, then marked as already-applied on
every environment that already has this schema (`drizzle-kit migrate`
tracks applied migrations in a `__drizzle_migrations` table it creates — on
an existing database you'd insert the baseline's record directly rather
than re-running the DDL). This step needs a real `DATABASE_URL` and hasn't
been run yet — **`lib/db/migrations/` is currently empty**, tracked by this
sprint as follow-up work rather than done blind.

## What did *not* change

- `push`/`push-force` are still there and still the fastest loop for local
  dev — this is additive, not a replacement of the dev workflow described
  in `replit.md`.
- No schema files were modified as part of introducing this.
- Deploy automation to run `migrate` on the Replit `postBuild`/deploy step
  is intentionally not wired up yet — that's an infrastructure change
  outside Sprint 1's "repository hygiene" scope, and shouldn't happen
  before a baseline migration exists.
