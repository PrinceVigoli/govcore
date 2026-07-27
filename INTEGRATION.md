# Integration report — five inbound bundles + Book 13

This documents what was reviewed, what was integrated, what was changed to make
it fit, and what is deliberately left undone. Read the security section first.

**Verified state after integration:** full workspace typecheck clean (14
projects), frontend builds, **381 engine tests passing** (up from 359).

---

## 1. Security finding — read before applying anything

### `govcore-superadmin-crosstenant` was not safe as delivered

The bundle grants superadmin roles genuine cross-tenant reach — a reasonable
feature for a platform operator running several LGUs. The problem was how
superadmin status is *determined*.

Superadmin was recognised by holding a role whose `code` is one of
`platform_admin` / `system_admin` / `super_admin`. But:

- roles live in a **tenant-scoped** table and are created through `POST /roles`;
- `CreateRoleBody` typed `code` as an unconstrained `zod.string()`, and the
  handler inserted `parsed.data` directly (`roles.ts:47`);
- `POST /users/:id/roles` assigns any role to any user.

So any user holding `identity:manage` **within their own tenant** — an ordinary
permission for a municipal IT administrator — could create a role named
`platform_admin`, assign it to themselves, and obtain read/write access to
every other LGU's records.

Before this bundle the same trick escalated only *within* the user's own
tenant. The bundle silently converted it into a cross-tenant hole.

### What was done instead

The feature was kept; the mechanism was replaced with a two-part check. **Both
halves must hold, and removing either reopens the escalation.**

**Half 1 — `lib/authorization.ts`.** Superadmin now requires a reserved code
**and** `isSystem === true`:

```ts
export function isSuperadminGrant(grant: RoleGrant): boolean {
  return grant.isSystem === true && SUPERADMIN_ROLE_CODES.includes(grant.roleCode);
}
```

`RoleGrant` gained an `isSystem` field, and `auth.ts` now selects
`rolesTable.isSystem` so the check has the data it needs.

**Half 2 — `routes/roles.ts`.** The roles API can no longer produce a role that
satisfies half 1:

- `POST /roles` rejects a reserved `code` with 403, and forces `isSystem: false`
  regardless of the request body.
- `PATCH /roles/:id` rejects a reserved `code`, refuses to modify a role that is
  already `isSystem`, and strips `isSystem` from the update.

The only `isSystem: true` superadmin role is the one written by the bootstrap
path in `ensureGovCoreUser`, which inserts directly via drizzle and never
through the API. Existing `platform_admin` holders are unaffected.

**Covered by tests** — `tests/engines/authorization.test.ts` grew from 51 to 73
tests, including a dedicated *privilege escalation guard* block asserting that a
forged reserved code with `isSystem: false` confers nothing, that `isSystem`
alone confers nothing, and that only both together work.

### The bundle's other change was a genuine bug fix, and was kept

`tenants` was listed in `tenantScopedTables`, so `enforceTenantRecord` ran
`select 1 from tenants where id = ? and tenant_id = ?` — but that table has no
`tenant_id` column (a tenant is not owned by a tenant). Every
`GET/PATCH/DELETE /tenants/:id` errored in Postgres and surfaced as a
misleading 401. Removed; access to tenant records is governed by the `identity`
module permission, which is correct.

---

## 2. Second finding — three route families had no permission check

Independent of the bundles: `moduleForPath` never mapped `reports` or `sync`
(an oversight in Books 10 and 13) or `treasury`. Because `requireAuth` only
enforces a module permission when `moduleForPath` returns non-null, those
endpoints were reachable by **any authenticated user regardless of role**. They
were still authenticated and tenant-scoped, but unguarded by RBAC — which for a
financial module is significant.

Added mappings for `reports`, `sync`, and `treasury`, with tests.

### This is a breaking change for existing databases — action required

The permission check fails **closed**. A module with no permission rows is
reachable by nobody except a genuine platform superadmin. Since these three
modules were added to the map after their routes shipped, an existing database
has no rows for them and those screens will 403 for ordinary staff.

A seed script was added:

```bash
pnpm --filter @workspace/scripts run seed:permissions
```

It is idempotent (`onConflictDoNothing`) and seeds `read` + `manage` for all
eleven modules. It deliberately does **not** grant anything to any role —
which role may touch treasury is a per-LGU policy decision, not a default. Grant
via `POST /roles/:id/permissions` or the Roles screen afterwards.

---

## 3. Applies to all five bundles — they cannot be extracted wholesale

Every bundle ships *shared* files that predate the current tree. A clobber check
found that extracting any of them over the repo would silently delete existing
wiring:

| Bundle | Stale shared files it carries |
|---|---|
| `treasury-module` | `App.tsx`, `Shell.tsx`, `routes/index.ts`, `schema/index.ts`, `openapi.yaml` — all missing Book 13 |
| `govcore-notification-preferences` | `App.tsx`, `Shell.tsx` — missing Book 13 |
| `citizen-portal-wip` | `schema/index.ts`, root `tsconfig.json` — missing Book 13 |
| `govcore-changes` | root + api-server `tsconfig.json` — missing Book 13 |

Every one of these was **hand-merged**, taking only the new lines. No shared
file was overwritten.

---

## 4. Per-bundle disposition

### `govcore-notification-preferences` — integrated as-is

The page is genuinely new and the backend already supports it
(`useListNotificationPreferences` / `useSetNotificationPreference` already
existed in the generated client). Took `pages/notification-preferences.tsx`;
hand-merged the route into `App.tsx` and one nav entry into `Shell.tsx`.

### `govcore-changes` — integrated as-is

A clean mechanical dedup: `backoffMs` and `STALE_PROCESSING_MS` extracted into a
new `@workspace/queue-utils` so the Notification and Integration queue workers
can't drift apart. Also brings real content for the six `docs/*.md` files
(previously one-line placeholders) and a `CHANGELOG.md`.

Wired `queue-utils` into the root tsconfig, api-server tsconfig + package.json,
and integration-engine tsconfig + package.json. Workspace is now 14 projects.

Note: the row-level locking its changelog mentions (`FOR UPDATE SKIP LOCKED`)
was already present in the repo — this bundle only shares the backoff constants.

### `treasury-module` — integrated, with five fixes

Substantial and worth having: 6 schema files (7 tables incl. voucher items), a
486-line route file with 28 endpoints, and 7 frontend pages. It was written
against a slightly older/different tree and needed:

1. **`lib/api-client-react/src/generated/treasury.ts` → `src/treasury.ts`.** The
   file is hand-authored but sat inside `src/generated/`, which orval's `clean`
   step wipes on **every** codegen run. It would have vanished the next time
   anyone regenerated. Moved out and exported from `src/index.ts`, with its
   relative import corrected.
2. **A local fetch adapter.** The hooks call an axios-style
   `customFetch(path, { params, data })`, but this repo's `customFetch` is
   fetch-style (`RequestInit`) — query strings go in the URL, bodies must be
   pre-serialized. Rather than change the shared fetch layer that every
   orval-generated hook depends on, a `treasuryFetch` adapter translates at that
   one boundary.
3. **`JwtPayload.sub` → `userId`** (3 sites). The module referenced a pre-Clerk
   token shape that no longer exists.
4. **`collectedAt`** arrives as an ISO string but the column is a timestamp —
   now converted with `new Date(...)` on update.
5. **Frontend typing** — Radix `onValueChange` is `(value: string) => void`,
   which doesn't accept union-typed setters; widened at the call sites rather
   than loosening the `useState` unions. Plus two `Record<string, unknown>`
   casts that needed to go through `unknown`.

**Its `openapi.yaml` was NOT applied.** It contains 90 paths (Book 10-era, no
sync) and **zero treasury paths**, so applying it would have deleted the Book 13
API surface while adding nothing.

### `citizen-portal-wip` — deferred, not integrated

Good groundwork and honest about being incomplete (schema only — no engine,
routes, or tests). Two reasons it is not in this bundle:

1. **It breaks the build as shipped.** `lib/citizen-portal/` has a `tsconfig.json`
   with `"include": ["src"]` but no `src/` directory, which fails with TS18003
   ("No inputs were found"). The package scaffold can't land until it has at
   least one source file.
2. **Naming collision.** It labels itself "Book 11", but Book 11 in the blueprint
   is the Search Engine, which is already built. Worth renumbering before it
   goes further.

Its schema design is sound and worth keeping — a separate `citizens` table
rather than a flag on `users` is the right call, and the reasoning in its header
comment is correct.

**One thing to decide before building it out:** the planned citizen auth uses
`jsonwebtoken` with a hand-rolled JWT. The Clerk migration removed exactly that
pattern from the staff path, and with it the `SESSION_SECRET` fallback problem.
Re-introducing it for citizens brings that concern back — a missing or weak
secret must fail loudly at startup, not fall back to a default.

---

## 5. Full change inventory

**New packages**
- `lib/queue-utils/` — `@workspace/queue-utils` (shared queue backoff)

**New schema (6 files, 7 tables)**
- `treasuryFunds`, `treasuryAccounts`, `treasuryBudgets`, `treasuryCollections`,
  `treasuryVouchers` (+ `treasury_voucher_items`), `treasuryTransactions`

**New routes**
- `artifacts/api-server/src/routes/treasury.ts` — 28 endpoints

**New frontend**
- `pages/treasury/` — overview, funds, accounts, budgets, vouchers,
  voucher-detail, collections
- `pages/notification-preferences.tsx`

**New scripts**
- `scripts/src/seed-permissions.ts`

**Security-relevant modifications**
- `lib/authorization.ts` — `isSuperadminGrant` / `anyGrantIsSuperadmin`,
  `RoleGrant.isSystem`, `reports`/`sync`/`treasury` mappings
- `lib/auth.ts` — cross-tenant superadmin, single grant fetch, `tenants` fix
- `routes/roles.ts` — reserved-code + `isSystem` guards

**Docs**
- `docs/*.md` (6 files), `CHANGELOG.md`, this file

---

## 6. Applying this

```bash
cd /path/to/govcore
unzip -o Gov-Core-Suite-book13-plus-integrations.zip   # from repo root
pnpm install          # links queue-utils + sync-engine → 14 projects
pnpm run typecheck    # expect clean
```

Then, **against your database**:

```bash
pnpm --filter @workspace/scripts run seed:permissions
```

…and grant `reports`, `sync`, and `treasury` to whichever roles should hold
them, or those screens will 403 for non-superadmins.

Treasury also needs its tables created (`pnpm --filter @workspace/db run push`
in development).

---

## 7. Known gaps, carried forward

Pre-existing and unchanged by this work:

- No email/SMS/push provider wired into `notificationEngine.deliver()`.
- No object storage for documents; content is stored inline.
- No running cron for `runDueSchedules()` (report schedules) or sync workers —
  both are models with worker hooks.
- Sync `seq` assignment reads `max(seq)` then inserts; under concurrent writes
  for one tenant this can collide. Needs a per-tenant sequence or a unique
  `(tenant_id, seq)` constraint with retry before high-concurrency production.
- No Postgres in the build environment, so every DB execution path here is
  verified by typecheck and pure-logic tests only — never executed.

New, introduced by this integration:

- **Treasury routes derive tenant scope from `req.query.tenantId`** (injected by
  `requireAuth`) rather than from `actor.tenantId` directly, the way the
  reports and sync routes do. It is correct today because the middleware
  injects it, but it is one forgotten line away from an unscoped query, and
  superadmins now skip that injection entirely. Worth normalising to
  `actor.tenantId` — deliberately not done here, as it would mean rewriting all
  28 endpoints of code someone else authored.
- **Treasury has no engine tests.** Every other module has a pure-logic suite;
  treasury's business rules (voucher approval transitions, budget balances)
  currently have none.
- **Treasury is not in `openapi.yaml`.** Its hooks are hand-authored, so the
  contract-first pipeline doesn't cover it. Adding its paths and regenerating
  would let the adapter in `src/treasury.ts` be deleted.
