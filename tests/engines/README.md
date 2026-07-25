# Engine tests

Tests for the pure decision logic inside the platform's engines — the parts
where a subtle mistake is silent and expensive (a validation that passes when
it shouldn't, a signature that verifies after tampering).

These run without a database. Each `*.core.ts` file is a copy of the pure
functions extracted from its engine, so the tests exercise real logic rather
than a reimplementation, but don't need `DATABASE_URL` to run.

## Running

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

Each exits non-zero on failure, so they work in CI as-is.

## Coverage

| Suite | Tests | What it pins down |
|---|---|---|
| `rules` | 28 | All 9 operators, AND/OR short-circuiting, nested groups, empty-group semantics, strict comparison (`"5" !== 5`) |
| `forms` | 11 | `isEmpty` semantics — `0` and `false` are answers, not blanks — and cross-field comparison |
| `notifications` | 43 | Template rendering, missing-variable detection, preference precedence, retry backoff, priority ordering, status rollup |
| `documents` | 42 | Lifecycle transitions, content hashing, path-traversal sanitization, QR verification decisions, signature staleness |
| `auth` | 2 | Actor extraction from the request (identity is otherwise handled by Clerk, not unit-testable here) |
| `authorization` | 51 | Path→module mapping (incl. `/api` prefix stripping, first-match ordering, ungated paths), RBAC predicate: superadmin bypass, `*` module/action wildcards, manage-implies-read asymmetry, null grants deny, fail-closed folding |
| `search` | 23 | Tokenization, title>subtitle>content weighting, all-tokens bonus, stable tie-breaking, permission filtering (fails closed) |
| `integrations` | 26 | Retry backoff (matches Notification Engine), retry vs dead-letter, HMAC signing, constant-time verification, tamper rejection |
| `reports` | 64 | Spec compiler: source/column whitelisting, unconditional tenant scoping, full parameterization (no inlined operands), enum validation, grouping; CSV RFC-4180 quoting; cron validation/matching/next-fire |

## Invariants worth keeping

Several tests exist because the behaviour is easy to break and hard to notice:

- **`isEmpty(false)` is `false`.** The server's `required` check treats a
  boolean `false` as a supplied answer. Pre-seeding a required checkbox with
  `false` would let an unticked consent box pass validation. (This was a real
  bug, caught here.)
- **`0` and `""` are valid answers**, both as form values and as template
  variables. "Total: 0" must render.
- **The rules engine compares strictly.** `"5"` never equals `5`, and
  `greater_than` against a string operand is always false.
- **Unresolved placeholders stay verbatim.** `{{citizen_name}}` on a printed
  certificate is an obvious defect someone reports; `undefined` looks like a
  real value and ships.
- **Attachment filenames can't escape their directory.** `../../etc/passwd`
  sanitizes to `.._.._etc_passwd`.
- **A signature covers one version's bytes.** Regenerating a document must
  leave the new version unsigned rather than inheriting the old approval.
- **Search permissions fail closed.** A user with no matching role/permission
  rows sees zero results, never everything.
- **`manage` implies `read`, but `read` never implies `manage`.** A read-only
  grant must not satisfy a write action — the asymmetry is the whole point of
  the split, and getting it backwards is a write-access hole.
- **Authorization fails closed too.** A user with no grants, or grants that
  don't match, is denied. Only an explicit match (or a superadmin role, or a
  `*` wildcard) permits.
- **A report can only touch a whitelisted source and its declared columns.**
  The compiler rejects any column not on the chosen source, always ANDs in
  `tenant_id = $N` from the caller (never from the spec), and binds every
  filter operand as a parameter — so user-supplied report config can't reach an
  arbitrary table, skip tenant scoping, or inject SQL. This is the single most
  important thing the `reports` suite guards.
- **`moduleForPath` only strips a leading `/api` segment**, not a substring —
  `/apidocs` is not `/docs`. A wrong path→module mapping guards a route with
  the wrong permissions, or none.
- **Webhook signatures verify in constant time and never throw.** A receiver
  handed a malformed signature gets `false`, not a crash — and timing can't be
  used to guess the signature byte-by-byte.
- **The two queue workers back off identically.** The integration retry queue
  uses the same backoff formula as the notification queue, so an operator
  reasoning about "how long until this retries" gets one answer, not two.

## Not covered

Anything touching the database: transactions, concurrency, query correctness.

**`workflowEngine.ts` has no database-free tests, unlike the other four
engines.** Every exported function in it (`actorHasPermission`,
`resolveTransition`, `applyTaskAction`, the `serialize*` helpers aside)
calls `db` directly — there's no pure decision-logic core to extract into a
`.core.ts` file the way `rules`/`forms`/`notifications`/`documents` do.
`resolveTransition`'s fallback-name matching in particular (falls back to a
transition literally named "approve"/"reject" when no explicit
`transitionId` is given) is exactly the kind of stringly-typed convention
that's easy to break silently — worth extracting into a pure, testable
function in a future pass rather than scaffolding a fake test around a
database-bound one now.

Two previously-known gaps here are now closed rather than merely documented:
the notification queue worker claims rows with `SELECT ... FOR UPDATE SKIP
LOCKED` before processing them (`processQueue` in `notificationEngine.ts`), and
`nextReferenceNumber` serializes on a `pg_advisory_xact_lock` scoped to the
tenant/prefix, backed by a `documents_tenant_reference_number_unique` index as
a defense-in-depth constraint (`documentEngine.ts`). Both fixes need a live
Postgres to exercise (row locking and advisory locks aren't meaningful without
real concurrent transactions), so they're not covered by these
database-free engine tests — a future integration test suite that opens two
overlapping transactions against a real database would be the place to pin
this down.
