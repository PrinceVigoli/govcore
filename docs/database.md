# Database

PostgreSQL, accessed through Drizzle ORM. `lib/db` is the single package that
owns the schema, connection, and generated types for every other package.

## Source of truth

- **`lib/db/src/schema/`** -- one file per table, re-exported from
  `index.ts`. This is the schema; nothing else defines tables.
- Config: `lib/db/drizzle.config.ts` reads `DATABASE_URL` from the
  environment and points at `./src/schema/index.ts`.

## Commands

Run from the repo root, filtered to the `db` package:

```bash
pnpm --filter @workspace/db run push          # push schema changes (dev only)
pnpm --filter @workspace/db run push-force    # push, accepting data loss
pnpm --filter @workspace/db run generate      # generate a migration file
pnpm --filter @workspace/db run migrate       # apply generated migrations
pnpm --filter @workspace/db run migrate:status
```

`push` is the fast dev loop (no migration files); `generate` + `migrate` is
the reviewable path for anything heading toward a shared/production database.

## Schema conventions

- **Multi-tenant from the ground up.** Nearly every table carries a
  `tenantId`; every query path that reads or writes tenant-owned data scopes
  by it. The Report Engine's compiler enforces this at the query-generation
  level: a data source must declare a `tenantColumn`, checked at module load,
  or the module throws.
- **Definition vs. version split.** Forms, workflows, and rules each have a
  `*_definitions` (or equivalent) table plus a versioned tree
  (`*_versions` and children). Only one version is `active` per definition;
  publishing a new one demotes the previous `active` version to `deprecated`
  in the same transaction. Historical submissions/instances stay bound to the
  exact version that was active when they were created.
- **JSON-in-text columns.** `rule_conditions.value`,
  `form_fields.options`/`defaultValue`, and `submission_values.value` are
  JSON-encoded text columns, so one column can hold any answer type. Decode
  defensively on every read -- these are not `jsonb` columns with schema
  validation.
- **Append-only audit/log tables.** `audit_logs`,
  `document_access_logs`/`document_download` trails,
  `notification_delivery`, `workflow_history`, `rule_history`, and
  `integration_events` are never updated in place, only inserted into.
- **Queue tables share one shape.** `notification_queue` and
  `integration_retry_queue` both use `status` (`pending` / `processing` /
  `failed` / dead-letter state), `attempts`, `maxAttempts`, and
  `availableAt`, claimed via `SELECT ... FOR UPDATE SKIP LOCKED` inside a
  transaction. See `@workspace/queue-utils` for the shared backoff/staleness
  constants both workers use.
- **Documents are addressed by UUID.** `documents`/`document_versions` don't
  store a filesystem path; a UUID resolves to wherever the content actually
  lives (inline, disk, NAS, or S3 -- see `documentEngine.ts`'s
  `storeContent()`), so switching storage backends never invalidates a
  reference or an already-issued QR code.

## Known constraints

- **`nextReferenceNumber` (documents) serializes on a
  `pg_advisory_xact_lock`** scoped to tenant + prefix, backed by a
  `documents_tenant_reference_number_unique` index as defense in depth. This
  needs a live Postgres with real concurrent transactions to exercise, so
  it's not covered by the database-free engine tests.
- **Row-locking behavior (`FOR UPDATE SKIP LOCKED`) is likewise only
  meaningful against a real database** -- the engine tests in
  `tests/engines/` cover the pure decision logic (backoff, retry-vs-dead-letter,
  status rollup) but not concurrency itself. A future integration-test suite
  that opens two overlapping transactions would be the place to pin that
  down.

## Required environment

- `DATABASE_URL` -- a Postgres connection string. Required for the API
  server at runtime and for any `lib/db` script above; not required to run
  the database-free tests in `tests/engines/`.
