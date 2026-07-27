# Roadmap

This tracks what's actually built versus planned. For the high-level
timeline and planned government modules table, see the README; this file
goes one level deeper on platform-layer status.

## Done

**Platform foundation**

- Identity: tenants, departments, users, roles, permissions, audit logs
- Book 05 -- Workflows: versioned state machines, task inbox, approve/reject, history
- Book 06 -- Rules: versioned condition trees, `/rules/evaluate` sandbox, priority ordering
- Book 07 -- Forms: versioned section/field/validation trees, 17 field types, draft/submit/sync
- Book 08 -- Notifications: versioned templates, per-recipient queue, backoff + dead-letter
- Book 09 -- Documents: versioned generation, e-signatures, public QR verification
- Book 10 -- Reports: whitelisted-source spec compiler, JSON/CSV output, cron schedule model
- Sprint 2A -- Search: global/entity search, permission-filtered, fails closed
- Sprint 2A -- Integrations: endpoint registry, signed webhooks, event log, retry queue
- Sprint 2A Task 3 -- coupling/dedup pass: shared backoff/staleness logic extracted into
  `@workspace/queue-utils`, used by both the notification and integration retry queues

**Auth**

- Migrated from local JWT/bcrypt to Clerk
- RBAC authorization layer extracted into a pure, tested module
  (`authorization.ts` + `tests/engines/authorization.test.ts`)

## Explicitly not started / known gaps

These are called out in `replit.md` and `tests/engines/README.md` as real
gaps, not oversights to silently work around:

- **No email/SMS/push provider is wired up.** `notificationEngine.ts`'s
  `deliver()` only actually delivers `in_app`/`announcement`; other channels
  fail with "no provider configured" and go through the normal retry path.
- **No running cron for report schedules.** `runDueSchedules()` is the entry
  point a worker/cron would call; this deployment ships no timer.
- **`workflowEngine.ts` has no database-free tests.** Every exported
  function in it touches `db` directly, unlike the other engines, so there's
  no pure core to extract yet.
- **No live-request / integration test suite.** Row-locking
  (`SELECT ... FOR UPDATE SKIP LOCKED`) and the documents module's advisory
  lock on reference-number generation need a real Postgres with overlapping
  transactions to exercise meaningfully.
- **CI doesn't yet run all 9 engine-test suites** -- `authorization`,
  `search`, `integrations`, and `reports` pass locally but aren't listed in
  `.github/workflows/ci.yml` yet.
- **`docs/api.md`'s contract has no automated request-level test suite** --
  coverage today comes from the engine tests plus manual/frontend usage.

## Planned modules

See the README's "Planned Government Modules" table and development
timeline (Agriculture through Health, 2027 Q1 onward) for the next layer of
work once the platform gaps above are closed out.
